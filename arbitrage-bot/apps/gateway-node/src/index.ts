import 'dotenv/config';
import { createLogger } from './logger';
import { loadConfig } from './config';
import { MarketDataGateway } from './socket';
import { PrivateStreamHandler } from './private';
import { RestClient } from './rest';
import { ClickHouseClient } from './clickhouse';
import { UDSClient } from './uds';
import { Broker } from './broker';
import { GatewayServer } from './server';

async function main() {
  const logger = createLogger('gateway');
  const config = loadConfig();

  logger.info('Starting Arbitrage Gateway Node...', {
    version: '1.0.0',
    environment: process.env['NODE_ENV'] || 'development',
    config: {
      exchange: config.exchange.restBase,
      server: `${config.server.host}:${config.server.port}`,
      uds: config.uds.enginePath
    }
  });

  // Store components for cleanup
  let clickhouse: ClickHouseClient;
  let udsClient: UDSClient;
  let marketGateway: MarketDataGateway;
  let privateStream: PrivateStreamHandler;
  let server: GatewayServer;

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    
    try {
      // Close all connections in order
      if (server) {
        logger.info('Closing HTTP/WebSocket server...');
        await server.stop();
      }
      
      if (marketGateway) {
        logger.info('Disconnecting from market data stream...');
        await marketGateway.disconnect();
      }
      
      if (privateStream) {
        logger.info('Disconnecting from private stream...');
        await privateStream.disconnect();
      }
      
      if (udsClient) {
        logger.info('Disconnecting from engine UDS...');
        await udsClient.disconnect();
      }
      
      logger.info('✓ All connections closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    // Initialize components
    clickhouse = new ClickHouseClient(config, logger);
    udsClient = new UDSClient(config.uds.enginePath, logger);
    const restClient = new RestClient(config, logger);
    marketGateway = new MarketDataGateway(config, udsClient, restClient, logger);
    privateStream = new PrivateStreamHandler(config, clickhouse, logger);
    const broker = new Broker(config, restClient, clickhouse, logger);

    // Initialize server
    server = new GatewayServer(
      config,
      broker,
      marketGateway,
      privateStream,
      restClient,
      clickhouse,
      logger
    );

    // Connect to external services
    logger.info('Connecting to external services...');
    
    await clickhouse.healthCheck();
    logger.info('✓ ClickHouse connected');

    await udsClient.connect();
    logger.info('✓ Engine UDS connected');

    // Set up opportunity callback to broadcast to frontend
    udsClient.setOpportunityCallback((bundle) => {
      server.broadcastOpportunity(bundle);
    });

    await marketGateway.connect();
    logger.info('✓ Market data stream connected');

    await privateStream.connect();
    logger.info('✓ Private stream connected');

    // Start server
    await server.start();
    logger.info('✓ Gateway server started');

    logger.info('🚀 Arbitrage Gateway Node is ready!', {
      endpoints: {
        health: `http://${config.server.host}:${config.server.port}/healthz`,
        ready: `http://${config.server.host}:${config.server.port}/readyz`,
        metrics: `http://${config.server.host}:${config.server.port}/metrics`,
        bundles: `http://${config.server.host}:${config.server.port}/bundles`
      }
    });

    // Health check monitoring
    setInterval(async () => {
      const health = {
        marketGateway: marketGateway.isConnected(),
        privateStream: privateStream.isConnected(),
        udsClient: udsClient.isConnected(),
        clickhouse: await clickhouse.healthCheck()
      };

      const allHealthy = Object.values(health).every(status => status === true);
      
      if (!allHealthy) {
        logger.warn('Health check failed:', health);
      }
    }, 30000); // Check every 30 seconds

  } catch (error) {
    logger.error('Failed to start gateway:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
