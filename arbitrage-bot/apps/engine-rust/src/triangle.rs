use crate::types::*;
use crate::decimal_utils::*;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::HashMap;

pub fn enumerate_triangles(symbols: &[String]) -> Vec<Triangle> {
    let mut triangles = Vec::new();
    
    for symbol in symbols {
        // Straight route: INR → USDT → X → INR
        // CoinDCX format: USDTINR, BTCUSDT, BTCINR
        triangles.push(Triangle {
            id: format!("{}:STRAIGHT", symbol),
            symbol: symbol.clone(),
            route: Route::Straight,
            markets: vec![
                "USDTINR".to_string(),
                format!("{}USDT", symbol),
                format!("{}INR", symbol),
            ],
            sides: vec!["BUY".to_string(), "BUY".to_string(), "SELL".to_string()],
            cap_inr: dec!(10000), // Default cap
        });
        
        // Reverse route: INR → X → USDT → INR
        triangles.push(Triangle {
            id: format!("{}:REVERSE", symbol),
            symbol: symbol.clone(),
            route: Route::Reverse,
            markets: vec![
                format!("{}INR", symbol),
                format!("{}USDT", symbol),
                "USDTINR".to_string(),
            ],
            sides: vec!["BUY".to_string(), "SELL".to_string(), "SELL".to_string()],
            cap_inr: dec!(10000), // Default cap
        });
    }
    
    triangles
}

pub fn evaluate_triangle(
    triangle: &Triangle,
    market_states: &HashMap<String, MarketState>,
    market_metas: &HashMap<String, MarketMeta>,
    capital_inr: Decimal,
    entry_threshold_bps: u32,
    fee_taker_bps: u32,
    slip_cap_bps: &HashMap<String, u32>,
) -> TriangleEvaluationResult {
    let mut legs = Vec::new();
    let mut current_amount = capital_inr;
    
    // Process each leg of the triangle
    for (i, (market, side)) in triangle.markets.iter().zip(triangle.sides.iter()).enumerate() {
        let market_state = match market_states.get(market) {
            Some(state) => state,
            None => {
                return TriangleEvaluationResult {
                    can_execute: false,
                    expected_edge: Decimal::ZERO,
                    legs,
                    capital_inr,
                    error: Some(format!("Missing market state for {}", market)),
                };
            }
        };
        
        let market_meta = match market_metas.get(market) {
            Some(meta) => meta,
            None => {
                return TriangleEvaluationResult {
                    can_execute: false,
                    expected_edge: Decimal::ZERO,
                    legs,
                    capital_inr,
                    error: Some(format!("Missing market meta for {}", market)),
                };
            }
        };
        
        let leg_key = format!("leg{}", i + 1);
        let max_slippage_bps = slip_cap_bps.get(&leg_key).copied().unwrap_or(10);
        
        let leg = match process_triangle_leg(
            market,
            side,
            &current_amount,
            market_state,
            market_meta,
            fee_taker_bps,
            max_slippage_bps,
        ) {
            Some(leg) => leg,
            None => {
                return TriangleEvaluationResult {
                    can_execute: false,
                    expected_edge: Decimal::ZERO,
                    legs,
                    capital_inr,
                    error: Some(format!("Failed to process leg {} for market {}", i + 1, market)),
                };
            }
        };
        
        legs.push(leg.clone());
        
        // Update for next leg - quantity of asset received
        // For BUY: we receive base currency (qty)
        // For SELL: we receive quote currency (price * qty)
        current_amount = if side == "BUY" {
            leg.qty  // Base currency received
        } else {
            leg.price * leg.qty  // Quote currency received
        };
    }
    
    // Calculate final edge
    let final_amount = legs.last().unwrap().price * legs.last().unwrap().qty;
    let expected_edge = calculate_edge_bps(capital_inr, final_amount);
    
    let can_execute = expected_edge >= Decimal::from(entry_threshold_bps);
    
    // Only log successful calculations at info level (happens in engine.rs when opportunity found)
    
    TriangleEvaluationResult {
        can_execute,
        expected_edge,
        legs,
        capital_inr,
        error: if can_execute {
            None
        } else {
            Some(format!(
                "Edge {} bps below threshold {} bps",
                decimal_to_bps(expected_edge),
                entry_threshold_bps
            ))
        },
    }
}

fn process_triangle_leg(
    market: &str,
    side: &str,
    current_amount: &Decimal,
    market_state: &MarketState,
    market_meta: &MarketMeta,
    fee_taker_bps: u32,
    max_slippage_bps: u32,
) -> Option<Leg> {
    let levels = match side {
        "BUY" => market_state.asks.iter().map(|l| (l.px, l.qty)).collect::<Vec<_>>(),
        "SELL" => market_state.bids.iter().map(|l| (l.px, l.qty)).collect::<Vec<_>>(),
        _ => return None,
    };
    
    let best_price = match side {
        "BUY" => market_state.best_ask,
        "SELL" => market_state.best_bid,
        _ => return None,
    };
    
    // Quietly return if no orderbook data yet (snapshots arrive after startup)
    if levels.is_empty() || best_price.is_zero() {
        return None;
    }
    
    // Determine quantity needed
    let qty = if side == "BUY" {
        // For BUY, we have quote currency and need base currency
        estimate_quantity_for_notional(&levels, *current_amount, side, market_meta.quantity_precision, 10)
    } else {
        // For SELL, we have base currency
        *current_amount
    };
    
    // Round to precision
    let qty = round_quantity_down(qty, market_meta.quantity_precision);
    
    // Validate quantity
    if !validate_quantity(qty, market_meta.min_qty, market_meta.max_qty.clone()) {
        return None;
    }
    
    // Check if we can fill with acceptable slippage
    let (can_fill, filled_qty, avg_price, levels_used, slippage_bps) = can_fill(
        &levels,
        qty,
        side,
        best_price,
        max_slippage_bps,
    );
    
    if !can_fill {
        return None;
    }
    
    // Calculate notional and fee
    let notional = filled_qty * avg_price;
    let fee = calculate_fee(notional, fee_taker_bps);
    let net_notional = apply_fee(notional, fee_taker_bps);
    
    Some(Leg {
        market: market.to_string(),
        side: side.to_string(),
        price: best_price,
        qty: filled_qty,
        time_in_force: "IOC".to_string(),
        intent: "TAKER".to_string(),
        vwap_price: avg_price,
        worst_price: avg_price, // Simplified - would need actual worst price from VWAP
        impact_bps: slippage_bps,
        levels_used: levels_used as u32,
    })
}

pub fn find_optimal_size(
    triangle: &Triangle,
    market_states: &HashMap<String, MarketState>,
    market_metas: &HashMap<String, MarketMeta>,
    entry_threshold_bps: u32,
    fee_taker_bps: u32,
    slip_cap_bps: &HashMap<String, u32>,
    min_quantum: Decimal,
    max_amount: Decimal,
) -> Option<TriangleEvaluationResult> {
    let sizing_ladder = generate_quantum_sizes(min_quantum, max_amount, min_quantum, 2);
    
    // Try sizes from largest to smallest to find the best opportunity
    let mut best_result: Option<TriangleEvaluationResult> = None;
    
    for size in sizing_ladder.iter().rev() {
        let result = evaluate_triangle(
            triangle,
            market_states,
            market_metas,
            *size,
            entry_threshold_bps,
            fee_taker_bps,
            slip_cap_bps,
        );
        
        // Keep track of best attempt for logging
        if best_result.is_none() || result.expected_edge > best_result.as_ref().unwrap().expected_edge {
            best_result = Some(result.clone());
        }
        
        if result.can_execute {
            return Some(result);
        }
    }
    
    // Only log if we got close to profitability (within 20 bps of threshold)
    if let Some(ref result) = best_result {
        if result.expected_edge >= Decimal::from(entry_threshold_bps - 20) {
            tracing::info!(
                "📉 Near-miss: {} | Best edge: {:.2} bps (need {} bps)",
                triangle.id,
                result.expected_edge,
                entry_threshold_bps
            );
        }
    }
    
    None
}

pub fn get_next_asset(symbol: &str, leg_index: usize, route: Route) -> String {
    match route {
        Route::Straight => match leg_index {
            0 => "USDT".to_string(), // INR → USDT
            1 => symbol.to_string(), // USDT → X
            2 => "INR".to_string(),  // X → INR
            _ => "INR".to_string(),
        },
        Route::Reverse => match leg_index {
            0 => symbol.to_string(), // INR → X
            1 => "USDT".to_string(), // X → USDT
            2 => "INR".to_string(),  // USDT → INR
            _ => "INR".to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_enumerate_triangles() {
        let symbols = vec!["BTC".to_string(), "ETH".to_string()];
        let triangles = enumerate_triangles(&symbols);
        
        assert_eq!(triangles.len(), 4); // 2 symbols * 2 routes
        
        // Check BTC straight triangle
        let btc_straight = triangles.iter().find(|t| t.id == "BTC:STRAIGHT").unwrap();
        assert_eq!(btc_straight.markets, vec!["USDTINR", "BTCUSDT", "BTCINR"]);
        assert_eq!(btc_straight.sides, vec!["BUY", "BUY", "SELL"]);
        
        // Check ETH reverse triangle
        let eth_reverse = triangles.iter().find(|t| t.id == "ETH:REVERSE").unwrap();
        assert_eq!(eth_reverse.markets, vec!["ETHINR", "ETHUSDT", "USDTINR"]);
        assert_eq!(eth_reverse.sides, vec!["BUY", "SELL", "SELL"]);
    }
    
    #[test]
    fn test_get_next_asset() {
        assert_eq!(get_next_asset("BTC", 0, Route::Straight), "USDT");
        assert_eq!(get_next_asset("BTC", 1, Route::Straight), "BTC");
        assert_eq!(get_next_asset("BTC", 2, Route::Straight), "INR");
        
        assert_eq!(get_next_asset("ETH", 0, Route::Reverse), "ETH");
        assert_eq!(get_next_asset("ETH", 1, Route::Reverse), "USDT");
        assert_eq!(get_next_asset("ETH", 2, Route::Reverse), "INR");
    }
}
