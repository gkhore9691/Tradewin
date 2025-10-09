use prometheus::{
    register_counter, register_histogram, register_gauge, register_histogram_vec,
    Counter, Histogram, Gauge, HistogramVec, Opts,
};
use std::time::Instant;

pub struct EngineMetrics {
    pub decision_latency: Histogram,
    pub triangles_evaluated: Counter,
    pub signals_emitted: Counter,
    pub cooldown_skips: Counter,
    pub edge_bps: HistogramVec,
    pub impact_bps: HistogramVec,
    pub levels_used: HistogramVec,
}

impl EngineMetrics {
    pub fn new() -> anyhow::Result<Self> {
        let decision_latency = register_histogram!(
            "decision_latency_ns",
            "Time taken to make trading decisions in nanoseconds"
        )?;

        let triangles_evaluated = register_counter!(
            "triangles_evaluated_total",
            "Total number of triangles evaluated"
        )?;

        let signals_emitted = register_counter!(
            "signals_emitted_total",
            "Total number of trading signals emitted"
        )?;

        let cooldown_skips = register_counter!(
            "cooldown_skips_total",
            "Total number of signals skipped due to cooldown"
        )?;

        let edge_bps = register_histogram_vec!(
            "edge_bps",
            "Expected arbitrage edge in basis points",
            &["route", "symbol"]
        )?;

        let impact_bps = register_histogram_vec!(
            "impact_bps",
            "Price impact in basis points",
            &["route", "symbol", "leg"]
        )?;

        let levels_used = register_histogram_vec!(
            "levels_used",
            "Number of order book levels used",
            &["route", "symbol", "leg"]
        )?;

        Ok(Self {
            decision_latency,
            triangles_evaluated,
            signals_emitted,
            cooldown_skips,
            edge_bps,
            impact_bps,
            levels_used,
        })
    }

    pub fn record_decision_latency(&self, duration: std::time::Duration) {
        self.decision_latency.observe(duration.as_nanos() as f64);
    }

    pub fn increment_triangles_evaluated(&self) {
        self.triangles_evaluated.inc();
    }

    pub fn increment_signals_emitted(&self) {
        self.signals_emitted.inc();
    }

    pub fn increment_cooldown_skips(&self) {
        self.cooldown_skips.inc();
    }

    pub fn record_edge_bps(&self, route: &str, symbol: &str, edge_bps: f64) {
        self.edge_bps
            .with_label_values(&[route, symbol])
            .observe(edge_bps);
    }

    pub fn record_impact_bps(&self, route: &str, symbol: &str, leg: &str, impact_bps: f64) {
        self.impact_bps
            .with_label_values(&[route, symbol, leg])
            .observe(impact_bps);
    }

    pub fn record_levels_used(&self, route: &str, symbol: &str, leg: &str, levels: f64) {
        self.levels_used
            .with_label_values(&[route, symbol, leg])
            .observe(levels);
    }
}

pub struct MetricsTimer<'a> {
    metrics: &'a EngineMetrics,
    start_time: Instant,
}

impl<'a> MetricsTimer<'a> {
    pub fn new(metrics: &'a EngineMetrics) -> Self {
        Self {
            metrics,
            start_time: Instant::now(),
        }
    }
}

impl<'a> Drop for MetricsTimer<'a> {
    fn drop(&mut self) {
        let duration = self.start_time.elapsed();
        self.metrics.record_decision_latency(duration);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_creation() {
        let metrics = EngineMetrics::new().unwrap();
        assert!(metrics.decision_latency.get_sample_count() >= 0);
    }

    #[test]
    fn test_metrics_timer() {
        let metrics = EngineMetrics::new().unwrap();
        let _timer = MetricsTimer::new(&metrics);
        // Timer will record duration when dropped
    }
}

