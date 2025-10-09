use crate::types::*;
use crate::triangle::*;
use crate::decimal_utils::*;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::mpsc;
use uuid::Uuid;

pub struct ArbitrageEngine {
    config: Arc<crate::config::EngineConfig>,
    market_states: Arc<RwLock<HashMap<String, MarketState>>>,
    market_metas: Arc<RwLock<HashMap<String, MarketMeta>>>,
    triangles: Arc<RwLock<Vec<Triangle>>>,
    triangles_by_market: Arc<RwLock<HashMap<String, Vec<Triangle>>>>,
    cooldowns: Arc<RwLock<HashMap<String, CooldownState>>>,
    circuit_breakers: Arc<RwLock<HashMap<String, CircuitBreakerState>>>,
    metrics: Arc<RwLock<EngineMetrics>>,
    bundle_tx: Arc<RwLock<Option<mpsc::UnboundedSender<OrderBundle>>>>,
}

#[derive(Debug, Clone)]
pub struct EngineMetrics {
    pub decisions_made: u64,
    pub signals_emitted: u64,
    pub cooldown_skips: u64,
    pub triangles_evaluated: u64,
    pub total_latency_ns: u128,
}

impl Default for EngineMetrics {
    fn default() -> Self {
        Self {
            decisions_made: 0,
            signals_emitted: 0,
            cooldown_skips: 0,
            triangles_evaluated: 0,
            total_latency_ns: 0,
        }
    }
}

impl ArbitrageEngine {
    pub fn new(config: Arc<crate::config::EngineConfig>) -> Self {
        Self {
            config,
            market_states: Arc::new(RwLock::new(HashMap::new())),
            market_metas: Arc::new(RwLock::new(HashMap::new())),
            triangles: Arc::new(RwLock::new(Vec::new())),
            triangles_by_market: Arc::new(RwLock::new(HashMap::new())),
            cooldowns: Arc::new(RwLock::new(HashMap::new())),
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
            metrics: Arc::new(RwLock::new(EngineMetrics::default())),
            bundle_tx: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_bundle_sender(&self, tx: mpsc::UnboundedSender<OrderBundle>) {
        let mut bundle_tx = self.bundle_tx.write().await;
        *bundle_tx = Some(tx);
    }

    pub async fn initialize(&self) -> anyhow::Result<()> {
        // Initialize triangles
        let triangles = enumerate_triangles(&self.config.symbols);
        
        // Build triangles by market index
        let mut triangles_by_market = HashMap::new();
        for triangle in &triangles {
            for market in &triangle.markets {
                triangles_by_market
                    .entry(market.clone())
                    .or_insert_with(Vec::new)
                    .push(triangle.clone());
            }
        }
        
        *self.triangles.write().await = triangles;
        *self.triangles_by_market.write().await = triangles_by_market;
        
        tracing::info!("Engine initialized with {} triangles", self.triangles.read().await.len());
        Ok(())
    }

    pub async fn update_market_state(&self, tick: TopOfBook) -> anyhow::Result<()> {
        let start_time = std::time::Instant::now();
        
        // Check if tick is stale
        if is_timestamp_stale(tick.ts_gateway_ns, self.config.book_max_age_ms) {
            tracing::warn!("Rejecting stale tick for market {}", tick.market);
            return Ok(());
        }
        
        // Normalize and store market state
        let market_state = MarketState {
            market: tick.market.clone(),
            asks: tick.depth_ask.clone(),
            bids: tick.depth_bid.clone(),
            best_bid: tick.best_bid,
            best_ask: tick.best_ask,
            last_update_ns: tick.ts_gateway_ns,
            stale: false,
        };
        
        // Silently skip empty orderbooks (they arrive gradually after startup)
        
        {
            let mut states = self.market_states.write().await;
            states.insert(tick.market.clone(), market_state);
        }
        
        // Process affected triangles
        self.process_affected_triangles(&tick.market).await?;
        
        let latency = start_time.elapsed().as_nanos();
        {
            let mut metrics = self.metrics.write().await;
            metrics.total_latency_ns += latency;
            metrics.decisions_made += 1;
            
            // Log stats every 1000 ticks
            if metrics.decisions_made % 1000 == 0 {
                let avg_latency_us = if metrics.decisions_made > 0 {
                    (metrics.total_latency_ns / metrics.decisions_made as u128) / 1000
                } else {
                    0
                };
                
                let market_count = self.market_states.read().await.len();
                
                tracing::info!(
                    "🔧 Engine stats | Ticks: {} | Markets: {} | Signals: {} | Cooldowns: {} | Avg latency: {}μs",
                    metrics.decisions_made,
                    market_count,
                    metrics.signals_emitted,
                    metrics.cooldown_skips,
                    avg_latency_us
                );
            }
        }
        
        Ok(())
    }

    async fn process_affected_triangles(&self, market: &str) -> anyhow::Result<()> {
        let triangles = {
            let triangles_by_market = self.triangles_by_market.read().await;
            triangles_by_market.get(market).cloned().unwrap_or_default()
        };
        
        if triangles.is_empty() {
            return Ok(());
        }
        
        let market_states = self.market_states.read().await;
        let market_metas = self.market_metas.read().await;
        
        for triangle in triangles {
            {
                let mut metrics = self.metrics.write().await;
                metrics.triangles_evaluated += 1;
            }
            
            // Check circuit breaker
            if self.is_circuit_breaker_active(&triangle.id).await {
                continue;
            }
            
            // Check cooldown
            if !self.cooldown_allows(&triangle.id).await {
                {
                    let mut metrics = self.metrics.write().await;
                    metrics.cooldown_skips += 1;
                }
                continue;
            }
            
            // Check if we have all required market states
            if !self.has_all_market_states(&triangle, &market_states) {
                continue;
            }
            
            // Evaluate triangle
            let slip_cap_bps = self.build_slip_cap_map();
            let result = find_optimal_size(
                &triangle,
                &market_states,
                &market_metas,
                self.config.entry_threshold_bps,
                self.config.fee_taker_bps,
                &slip_cap_bps,
                dec!(1000), // min_quantum
                triangle.cap_inr,
            );
            
            match result {
                Some(evaluation) => {
                    let final_amount = evaluation.legs.last().unwrap().price * evaluation.legs.last().unwrap().qty;
                    let profit = final_amount - evaluation.capital_inr;
                    
                    // Always emit bundle for frontend display (both positive and negative)
                    self.emit_order_bundle(&triangle, evaluation.clone()).await;
                    
                    // Log all opportunities at info level for verification
                    let status = if evaluation.can_execute { "💰 PROFITABLE" } else { "📊 EVALUATED" };
                    tracing::info!(
                        "{} {} | Edge: {:.2} bps | Profit: {:.2} INR | Size: {} INR",
                        status,
                        triangle.id,
                        evaluation.expected_edge,
                        profit,
                        evaluation.capital_inr
                    );
                    
                    // Check if edge improved enough to bypass cooldown for actual execution
                    if self.edge_improved_enough(&triangle.id, evaluation.expected_edge).await {
                        self.set_cooldown(&triangle.id, evaluation.expected_edge).await;
                    }
                }
                None => {
                    // Silently skip - most evaluations fail due to incomplete orderbooks or unprofitable spreads
                }
            }
        }
        
        Ok(())
    }

    fn has_all_market_states(&self, triangle: &Triangle, market_states: &HashMap<String, MarketState>) -> bool {
        for market in &triangle.markets {
            if !market_states.contains_key(market) {
                return false;
            }
        }
        true
    }

    fn build_slip_cap_map(&self) -> HashMap<String, u32> {
        let mut map = HashMap::new();
        map.insert("leg1".to_string(), self.config.get_slip_cap_bps("leg1"));
        map.insert("leg2".to_string(), self.config.get_slip_cap_bps("leg2"));
        map.insert("leg3".to_string(), self.config.get_slip_cap_bps("leg3"));
        map
    }

    async fn is_circuit_breaker_active(&self, triangle_id: &str) -> bool {
        let circuit_breakers = self.circuit_breakers.read().await;
        if let Some(state) = circuit_breakers.get(triangle_id) {
            if let Some(quarantine_until) = state.quarantined_until {
                if get_current_time_ns() < quarantine_until {
                    return true;
                }
            }
        }
        false
    }

    async fn cooldown_allows(&self, triangle_id: &str) -> bool {
        let cooldowns = self.cooldowns.read().await;
        if let Some(cooldown) = cooldowns.get(triangle_id) {
            let now = get_current_time_ns();
            let elapsed = now - cooldown.last_emit_time;
            let cooldown_ns = self.config.cooldown_ms * 1_000_000;
            return elapsed >= cooldown_ns;
        }
        true
    }

    async fn edge_improved_enough(&self, triangle_id: &str, new_edge: Decimal) -> bool {
        let cooldowns = self.cooldowns.read().await;
        if let Some(cooldown) = cooldowns.get(triangle_id) {
            let improvement = new_edge - cooldown.last_edge_bps;
            let min_improvement = dec!(3); // 3 bps minimum improvement
            return improvement >= min_improvement;
        }
        true
    }

    async fn emit_order_bundle(&self, triangle: &Triangle, evaluation: TriangleEvaluationResult) {
        let risk_token = Uuid::new_v4().to_string();
        let now = get_current_time_ns();
        
        let bundle = OrderBundle {
            triangle_id: triangle.id.clone(),
            route: triangle.route.to_string(),
            legs: evaluation.legs,
            expected_edge: evaluation.expected_edge,
            capital_inr: evaluation.capital_inr,
            risk_token,
            ts_engine_ns: now,
        };
        
        // Send bundle to gateway via channel
        let bundle_tx = self.bundle_tx.read().await;
        if let Some(ref tx) = *bundle_tx {
            if let Err(e) = tx.send(bundle.clone()) {
                tracing::error!("Failed to send bundle to gateway: {}", e);
            } else {
                tracing::debug!("Bundle sent to gateway via channel");
            }
        }
        
        {
            let mut metrics = self.metrics.write().await;
            metrics.signals_emitted += 1;
        }
    }

    async fn set_cooldown(&self, triangle_id: &str, edge_bps: Decimal) {
        let mut cooldowns = self.cooldowns.write().await;
        cooldowns.insert(triangle_id.to_string(), CooldownState {
            last_emit_time: get_current_time_ns(),
            last_edge_bps: edge_bps,
        });
    }

    pub async fn get_metrics(&self) -> EngineMetrics {
        self.metrics.read().await.clone()
    }

    pub async fn get_market_states(&self) -> HashMap<String, MarketState> {
        self.market_states.read().await.clone()
    }

    pub async fn get_triangles(&self) -> Vec<Triangle> {
        self.triangles.read().await.clone()
    }

    pub async fn update_market_meta(&self, meta: MarketMeta) {
        let mut metas = self.market_metas.write().await;
        metas.insert(meta.market.clone(), meta);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_engine_initialization() {
        let config = Arc::new(crate::config::EngineConfig::default());
        let engine = ArbitrageEngine::new(config);
        
        engine.initialize().await.unwrap();
        
        let triangles = engine.get_triangles().await;
        assert!(!triangles.is_empty());
    }
}
