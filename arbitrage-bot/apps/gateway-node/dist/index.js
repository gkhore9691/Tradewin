"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const logger_1 = require("./logger");
const config_1 = require("./config");
const socket_1 = require("./socket");
const private_1 = require("./private");
const rest_1 = require("./rest");
const clickhouse_1 = require("./clickhouse");
const uds_1 = require("./uds");
const broker_1 = require("./broker");
const server_1 = require("./server");
async function main() {
    const logger = (0, logger_1.createLogger)('gateway');
    const config = (0, config_1.loadConfig)();
    logger.info('Starting Arbitrage Gateway Node...', {
        version: '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
        config: {
            exchange: config.exchange.restBase,
            server: `${config.server.host}:${config.server.port}`,
            uds: config.uds.enginePath
        }
    });
    try {
        // Initialize components
        const clickhouse = new clickhouse_1.ClickHouseClient(config, logger);
        const udsClient = new uds_1.UDSClient(config.uds.enginePath, logger);
        const restClient = new rest_1.RestClient(config, logger);
        const marketGateway = new socket_1.MarketDataGateway(config, udsClient, restClient, logger);
        const privateStream = new private_1.PrivateStreamHandler(config, clickhouse, logger);
        const broker = new broker_1.Broker(config, restClient, clickhouse, logger);
        // Initialize server
        const server = new server_1.GatewayServer(config, broker, marketGateway, privateStream, restClient, clickhouse, logger);
        // Connect to external services
        logger.info('Connecting to external services...');
        await clickhouse.healthCheck();
        logger.info('✓ ClickHouse connected');
        await udsClient.connect();
        logger.info('✓ Engine UDS connected');
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
    }
    catch (error) {
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
//# sourceMappingURL=index.js.map