use arbitrage_engine::{ArbitrageEngine, UDSServer, EngineConfig};
use std::sync::Arc;
use tracing::{info, error};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing with fallback to info level
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        )
        .with_target(false)
        .with_thread_ids(true)
        .with_line_number(true)
        .init();

    info!("🚀 Starting Arbitrage Engine...");

    // Load configuration
    let config = Arc::new(EngineConfig::load()?);
    info!("⚙️  Threshold: {} bps | Symbols: {}", config.entry_threshold_bps, config.symbols.len());

    // Initialize engine
    let engine = Arc::new(ArbitrageEngine::new(config.clone()));
    engine.initialize().await?;

    // Start UDS server
    let uds_server = UDSServer::new(Arc::clone(&engine), config.uds_path.clone());
    
    info!("🔌 UDS listening on {}", config.uds_path);
    
    // Run the server
    if let Err(e) = uds_server.start().await {
        error!("UDS server failed: {}", e);
        return Err(e);
    }

    Ok(())
}

