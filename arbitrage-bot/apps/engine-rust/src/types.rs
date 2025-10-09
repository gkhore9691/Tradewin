use serde::{Deserialize, Serialize};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthLevel {
    pub px: Decimal,
    pub qty: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopOfBook {
    pub market: String,
    #[serde(rename = "bestBid")]
    pub best_bid: Decimal,
    #[serde(rename = "bestBidQty")]
    pub best_bid_qty: Decimal,
    #[serde(rename = "bestAsk")]
    pub best_ask: Decimal,
    #[serde(rename = "bestAskQty")]
    pub best_ask_qty: Decimal,
    #[serde(rename = "depthBid")]
    pub depth_bid: Vec<DepthLevel>,
    #[serde(rename = "depthAsk")]
    pub depth_ask: Vec<DepthLevel>,
    #[serde(rename = "tsExchangeNs")]
    pub ts_exchange_ns: u64,
    #[serde(rename = "tsGatewayNs")]
    pub ts_gateway_ns: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketMeta {
    pub market: String,
    pub base: String,
    pub quote: String,
    pub price_precision: u32,
    pub quantity_precision: u32,
    pub min_qty: Decimal,
    pub min_notional: Decimal,
    pub max_qty: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Leg {
    pub market: String,
    pub side: String, // "BUY" | "SELL"
    pub price: Decimal,
    pub qty: Decimal,
    pub time_in_force: String, // "IOC" | "FOK" | "GTC"
    pub intent: String, // "TAKER"
    pub vwap_price: Decimal,
    pub worst_price: Decimal,
    pub impact_bps: Decimal,
    pub levels_used: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBundle {
    pub triangle_id: String,
    pub route: String, // "STRAIGHT" | "REVERSE"
    pub legs: Vec<Leg>,
    pub expected_edge: Decimal,
    pub capital_inr: Decimal,
    pub risk_token: String,
    pub ts_engine_ns: u64,
}

#[derive(Debug, Clone)]
pub struct Triangle {
    pub id: String,
    pub symbol: String,
    pub route: Route,
    pub markets: Vec<String>,
    pub sides: Vec<String>,
    pub cap_inr: Decimal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Straight,
    Reverse,
}

impl std::fmt::Display for Route {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Route::Straight => write!(f, "STRAIGHT"),
            Route::Reverse => write!(f, "REVERSE"),
        }
    }
}

impl From<Route> for String {
    fn from(route: Route) -> Self {
        route.to_string()
    }
}

#[derive(Debug, Clone)]
pub struct MarketState {
    pub market: String,
    pub asks: Vec<DepthLevel>,
    pub bids: Vec<DepthLevel>,
    pub best_bid: Decimal,
    pub best_ask: Decimal,
    pub last_update_ns: u64,
    pub stale: bool,
}

#[derive(Debug, Clone)]
pub struct TriangleEvaluationResult {
    pub can_execute: bool,
    pub expected_edge: Decimal,
    pub legs: Vec<Leg>,
    pub capital_inr: Decimal,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CircuitBreakerState {
    pub reject_rate_bps: u32,
    pub slippage_bps_p95: u32,
    pub last_reject_time: Option<u64>,
    pub last_slippage_time: Option<u64>,
    pub quarantined_until: Option<u64>,
}

impl Default for CircuitBreakerState {
    fn default() -> Self {
        Self {
            reject_rate_bps: 0,
            slippage_bps_p95: 0,
            last_reject_time: None,
            last_slippage_time: None,
            quarantined_until: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CooldownState {
    pub last_emit_time: u64,
    pub last_edge_bps: Decimal,
}

impl Default for CooldownState {
    fn default() -> Self {
        Self {
            last_emit_time: 0,
            last_edge_bps: Decimal::ZERO,
        }
    }
}

pub fn get_current_time_ns() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
}

pub fn is_timestamp_stale(timestamp_ns: u64, max_age_ms: u64) -> bool {
    let now_ns = get_current_time_ns();
    let max_age_ns = max_age_ms * 1_000_000;
    (now_ns - timestamp_ns) > max_age_ns
}

