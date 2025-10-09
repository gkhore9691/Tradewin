use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::TryFrom;
use rust_decimal::Decimal;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub entry_threshold_bps: u32,
    pub cooldown_ms: u64,
    pub fee_taker_bps: u32,
    pub min_fill_fraction_l1: f64,
    pub min_fill_fraction_l2: f64,
    pub triangle_cap_inr: Decimal,
    pub symbol_cap_inr: Decimal,
    pub book_max_age_ms: u64,
    pub bid_ask_levels: usize,
    pub slip_cap_bps: HashMap<String, u32>, // per-leg slippage caps
    pub aggressive_eps_bps: u32,
    pub uds_path: String,
    pub symbols: Vec<String>,
    pub reject_rate_limit_bps: u32,
    pub slippage_limit_bps: u32,
    pub quiet_period_ms: u64,
}

impl Default for EngineConfig {
    fn default() -> Self {
        let mut slip_cap_bps = HashMap::new();
        slip_cap_bps.insert("leg1".to_string(), 8);
        slip_cap_bps.insert("leg2".to_string(), 10);
        slip_cap_bps.insert("leg3".to_string(), 8);

        Self {
            entry_threshold_bps: 8,
            cooldown_ms: 250,
            fee_taker_bps: 20,
            min_fill_fraction_l1: 0.85,
            min_fill_fraction_l2: 0.90,
            triangle_cap_inr: Decimal::from(10000),
            symbol_cap_inr: Decimal::from(30000),
            book_max_age_ms: 1500,
            bid_ask_levels: 20,
            slip_cap_bps,
            aggressive_eps_bps: 2,
            uds_path: "/tmp/arb_engine.sock".to_string(),
            symbols: vec![
                "BTC".to_string(),
                "ETH".to_string(),
                "BNB".to_string(),
                "ADA".to_string(),
                "SOL".to_string(),
            ],
            reject_rate_limit_bps: 500,
            slippage_limit_bps: 15,
            quiet_period_ms: 60000,
        }
    }
}

impl EngineConfig {
    pub fn load() -> anyhow::Result<Self> {
        let mut config = config::Config::default();
        
        // Load from config file if it exists
        if std::path::Path::new("config.toml").exists() {
            config.merge(config::File::with_name("config"))?;
        }
        
        // Override with environment variables
        config.merge(config::Environment::with_prefix("ENGINE"))?;
        
        let engine_config: EngineConfig = config.try_into()?;
        Ok(engine_config)
    }
    
    pub fn get_slip_cap_bps(&self, leg: &str) -> u32 {
        self.slip_cap_bps.get(leg).copied().unwrap_or(10)
    }
}

impl TryFrom<config::Config> for EngineConfig {
    type Error = config::ConfigError;
    
    fn try_from(config: config::Config) -> Result<Self, Self::Error> {
        config.try_deserialize()
    }
}
