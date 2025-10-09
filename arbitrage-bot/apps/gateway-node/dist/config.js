"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.loadConfig = loadConfig;
exports.defaultConfig = {
    exchange: {
        restBase: process.env['EXCHANGE_REST_BASE'] || 'https://api.coindcx.com',
        publicBase: process.env['EXCHANGE_PUBLIC_BASE'] || 'https://public.coindcx.com',
        wsPublic: process.env['EXCHANGE_WS_PUBLIC'] || 'wss://stream.coindcx.com',
        wsPrivate: process.env['EXCHANGE_WS_PRIVATE'] || 'wss://stream.coindcx.com',
        apiKey: process.env['EXCHANGE_API_KEY'] || '',
        apiSecret: process.env['EXCHANGE_API_SECRET'] || ''
    },
    symbols: (process.env['SYMBOLS'] || 'BTC,ETH,BNB,ADA,SOL')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    ws: {
        transport: 'websocket',
        versionPin: process.env['WS_VERSION_PIN'] || '2.4.0',
        orderTif: process.env['ORDER_TIF'] || 'IOC',
        aggressiveEpsBps: parseInt(process.env['AGGRESSIVE_EPS_BPS'] || '2'),
        bidAskLevels: parseInt(process.env['BID_ASK_LEVELS'] || '5'),
        depthSlipBuffer: parseFloat(process.env['DEPTH_SLIP_BUFFER'] || '0.02')
    },
    engine: {
        entryThresholdBps: parseInt(process.env['ENTRY_THRESHOLD_BPS'] || '8'),
        cooldownMs: parseInt(process.env['COOLDOWN_MS'] || '250'),
        feeTakerBps: parseInt(process.env['FEE_TAKER_BPS'] || '20'),
        minFillFractionL1: parseFloat(process.env['MIN_FILL_FRACTION_L1'] || '0.85'),
        minFillFractionL2: parseFloat(process.env['MIN_FILL_FRACTION_L2'] || '0.90'),
        triangleCapInr: parseInt(process.env['TRIANGLE_CAP_INR'] || '10000'),
        symbolCapInr: parseInt(process.env['SYMBOL_CAP_INR'] || '30000')
    },
    risk: {
        rejectRateLimitBps: parseInt(process.env['REJECT_RATE_LIMIT_BPS'] || '500'),
        slippageLimitBps: parseInt(process.env['SLIPPAGE_LIMIT_BPS'] || '15')
    },
    clickhouse: {
        dsn: process.env['CH_DSN'] || 'http://clickhouse:8123',
        database: process.env['CH_DB'] || 'arb'
    },
    server: {
        port: parseInt(process.env['PORT'] || '3000'),
        host: process.env['HOST'] || '0.0.0.0'
    },
    uds: {
        enginePath: process.env['UDS_ENGINE_PATH'] || '/tmp/arb_engine.sock'
    }
};
function loadConfig() {
    return exports.defaultConfig;
}
//# sourceMappingURL=config.js.map