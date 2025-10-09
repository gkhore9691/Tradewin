use crate::types::*;
use crate::engine::ArbitrageEngine;
use std::path::Path;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};

pub struct UDSServer {
    engine: Arc<ArbitrageEngine>,
    socket_path: String,
}

impl UDSServer {
    pub fn new(engine: Arc<ArbitrageEngine>, socket_path: String) -> Self {
        Self {
            engine,
            socket_path,
        }
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        // Remove existing socket file if it exists
        if Path::new(&self.socket_path).exists() {
            std::fs::remove_file(&self.socket_path)?;
        }

        let listener = UnixListener::bind(&self.socket_path)?;
        info!("UDS server listening on {}", self.socket_path);

        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let engine = Arc::clone(&self.engine);
                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection(stream, engine).await {
                            error!("Error handling UDS connection: {}", e);
                        }
                    });
                }
                Err(e) => {
                    error!("Failed to accept UDS connection: {}", e);
                }
            }
        }
    }

    async fn handle_connection(mut stream: UnixStream, engine: Arc<ArbitrageEngine>) -> anyhow::Result<()> {
        let mut buffer = vec![0u8; 4096];
        
        // Create channel for sending bundles back to gateway
        let (tx, mut rx) = mpsc::unbounded_channel::<OrderBundle>();
        
        // This is a workaround - in production, use Arc<RwLock<>> for the engine
        // For now, just spawn a task to read from the channel and send bundles
        let (read_stream, mut write_stream) = stream.into_split();
        let mut read_stream = read_stream;
        
        // Spawn task to send bundles to gateway
        tokio::spawn(async move {
            while let Some(bundle) = rx.recv().await {
                // Serialize bundle
                let json = serde_json::to_string(&bundle).unwrap();
                let data = json.as_bytes();
                
                // Send length prefix + data
                let length = data.len() as u32;
                let length_bytes = length.to_be_bytes();
                
                if let Err(e) = write_stream.write_all(&length_bytes).await {
                    error!("Failed to write bundle length: {}", e);
                    break;
                }
                
                if let Err(e) = write_stream.write_all(data).await {
                    error!("Failed to write bundle data: {}", e);
                    break;
                }
                
                // Silently send bundles - frontend will show them
            }
        });
        
        loop {
            // Read message length (4 bytes)
            let mut length_buffer = [0u8; 4];
            match read_stream.read_exact(&mut length_buffer).await {
                Ok(_) => {
                    let length = u32::from_be_bytes(length_buffer) as usize;
                    
                    if length > buffer.len() {
                        buffer.resize(length, 0);
                    }
                    
                    // Read message payload
                    match read_stream.read_exact(&mut buffer[..length]).await {
                        Ok(_) => {
                            // Parse and process message
                            if let Err(e) = Self::process_message(&buffer[..length], &engine, &tx).await {
                                error!("Error processing message: {}", e);
                            }
                        }
                        Err(e) => {
                            if e.kind() != std::io::ErrorKind::UnexpectedEof {
                                error!("Error reading message payload: {}", e);
                            }
                            break;
                        }
                    }
                }
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::UnexpectedEof {
                        error!("Error reading message length: {}", e);
                    }
                    break;
                }
            }
        }
        
        Ok(())
    }

    async fn process_message(data: &[u8], engine: &ArbitrageEngine, bundle_tx: &mpsc::UnboundedSender<OrderBundle>) -> anyhow::Result<()> {
        // Simple JSON deserialization for now
        // In production, use Protobuf or FlatBuffers
        let message_str = std::str::from_utf8(data)?;
        
        // Set the bundle sender in engine
        engine.set_bundle_sender(bundle_tx.clone()).await;
        
        match serde_json::from_str::<serde_json::Value>(message_str) {
            Ok(json) => {
                if let Some(message_type) = json.get("message_type").and_then(|v| v.as_str()) {
                    match message_type {
                        "tick" => {
                            if let Ok(tick) = serde_json::from_value::<TopOfBook>(json) {
                                // Silently process ticks - logging happens at higher level
                                if let Err(e) = engine.update_market_state(tick).await {
                                    error!("Error processing tick: {}", e);
                                }
                            } else {
                                warn!("Failed to deserialize tick from JSON");
                            }
                        }
                        "market_meta" => {
                            if let Ok(meta) = serde_json::from_value::<MarketMeta>(json) {
                                // Silently process market metadata
                                engine.update_market_meta(meta).await;
                            }
                        }
                        _ => {
                            warn!("Unknown message type: {}", message_type);
                        }
                    }
                } else {
                    warn!("No message_type field in JSON");
                }
            }
            Err(e) => {
                error!("Failed to parse JSON message: {} | Data: {}", e, message_str);
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::EngineConfig;
    
    #[tokio::test]
    async fn test_uds_server_creation() {
        let config = Arc::new(EngineConfig::default());
        let engine = Arc::new(ArbitrageEngine::new(config));
        let server = UDSServer::new(engine, "/tmp/test_engine.sock".to_string());
        
        // Test that server can be created
        assert_eq!(server.socket_path, "/tmp/test_engine.sock");
    }
}
