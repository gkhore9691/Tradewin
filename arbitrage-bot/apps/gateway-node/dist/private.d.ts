import { Logger } from 'winston';
import { GatewayConfig } from './config';
import { ClickHouseClient } from './clickhouse';
export declare class PrivateStreamHandler {
    private socket;
    private logger;
    private config;
    private clickhouse;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor(config: GatewayConfig, clickhouse: ClickHouseClient, logger: Logger);
    connect(): Promise<void>;
    private setupEventHandlers;
    private authenticate;
    private generateAuthSignature;
    private handleOrderUpdate;
    private handleTradeFill;
    private handleBalanceUpdate;
    private handleUserData;
    isConnected(): boolean;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=private.d.ts.map