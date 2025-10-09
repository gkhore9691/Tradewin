import { Logger } from 'winston';
import { Decimal } from 'decimal.js';
import { GatewayConfig } from './config';
import { RestClient } from './rest';
import { UDSClient } from './uds';
import { DepthLevel } from './schemas';
export interface MarketState {
    market: string;
    asks: DepthLevel[];
    bids: DepthLevel[];
    bestBid: Decimal;
    bestAsk: Decimal;
    lastUpdateNs: number;
    stale: boolean;
}
export declare class MarketDataGateway {
    private socket;
    private marketStates;
    private orderBooks;
    private udsClient;
    private restClient;
    private logger;
    private config;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private wsDebug;
    private tickCount;
    private lastStatsLog;
    constructor(config: GatewayConfig, udsClient: UDSClient, restClient: RestClient, logger: Logger);
    connect(): Promise<void>;
    private setupEventHandlers;
    private subscribeToMarkets;
    private handleCoinDCXMessage;
    private getOrCreateBook;
    private applySnapshotOrUpdate;
    private materializeTopLevels;
    getMarketState(market: string): MarketState | undefined;
    getAllMarketStates(): Map<string, MarketState>;
    isConnected(): boolean;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=socket.d.ts.map