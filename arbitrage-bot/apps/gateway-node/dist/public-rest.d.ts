import { Logger } from 'winston';
import { GatewayConfig } from './config';
export interface OrderBookSnapshot {
    bids: Record<string, string>;
    asks: Record<string, string>;
}
export interface PublicTrade {
    p: number;
    q: number;
    s: string;
    T: number;
    m: boolean;
}
export interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: number;
}
export declare class PublicRestClient {
    private client;
    private logger;
    private config;
    constructor(config: GatewayConfig, logger: Logger);
    private setupInterceptors;
    getOrderBookSnapshot(pair: string): Promise<OrderBookSnapshot>;
    getTradeHistory(pair: string, limit?: number): Promise<PublicTrade[]>;
    getCandles(pair: string, interval: '1m' | '5m' | '60m' | '1D', startTime?: number, endTime?: number, limit?: number): Promise<Candle[]>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=public-rest.d.ts.map