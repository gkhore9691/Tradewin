export interface GatewayConfig {
    exchange: {
        restBase: string;
        publicBase: string;
        wsPublic: string;
        wsPrivate: string;
        apiKey: string;
        apiSecret: string;
    };
    symbols: string[];
    ws: {
        transport: 'websocket';
        versionPin: string;
        orderTif: 'IOC' | 'FOK' | 'GTC';
        aggressiveEpsBps: number;
        bidAskLevels: number;
        depthSlipBuffer: number;
    };
    engine: {
        entryThresholdBps: number;
        cooldownMs: number;
        feeTakerBps: number;
        minFillFractionL1: number;
        minFillFractionL2: number;
        triangleCapInr: number;
        symbolCapInr: number;
    };
    risk: {
        rejectRateLimitBps: number;
        slippageLimitBps: number;
    };
    clickhouse: {
        dsn: string;
        database: string;
    };
    server: {
        port: number;
        host: string;
    };
    uds: {
        enginePath: string;
    };
}
export declare const defaultConfig: GatewayConfig;
export declare function loadConfig(): GatewayConfig;
//# sourceMappingURL=config.d.ts.map