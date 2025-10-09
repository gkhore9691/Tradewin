import { Logger } from 'winston';
import { Decimal } from 'decimal.js';
import { GatewayConfig } from './config';
export interface OrderRequest {
    market: string;
    total_quantity: string;
    price_per_unit?: string;
    side: 'buy' | 'sell';
    order_type: 'market_order' | 'limit_order' | 'stop_limit' | 'take_profit';
    client_order_id?: string;
    timestamp: number;
}
export interface OrderResponse {
    id: string;
    client_order_id?: string;
    market: string;
    order_type: string;
    side: 'buy' | 'sell';
    status: 'open' | 'filled' | 'cancelled' | 'partially_filled';
    fee_amount?: number;
    fee?: number;
    total_quantity: number;
    remaining_quantity: number;
    avg_price: number;
    price_per_unit: number;
    created_at: string;
    updated_at: string;
}
export interface Balance {
    currency: string;
    balance: number;
    locked_balance: number;
}
export interface MarketInfo {
    coindcx_name: string;
    symbol: string;
    ecode: string;
    pair: string;
    base_currency_short_name: string;
    target_currency_short_name: string;
    base_currency_precision: number;
    target_currency_precision: number;
    min_quantity: Decimal;
    max_quantity?: Decimal;
    min_price: Decimal;
    max_price?: Decimal;
    min_notional?: Decimal;
    step: Decimal;
    order_types: string[];
    status: string;
}
export declare class RestClient {
    private client;
    private logger;
    private config;
    private rateLimiters;
    constructor(config: GatewayConfig, logger: Logger);
    private setupInterceptors;
    private addAuthHeaders;
    private generateSignature;
    getBalances(): Promise<Balance[]>;
    getMarkets(): Promise<string[]>;
    getMarketDetails(): Promise<MarketInfo[]>;
    placeOrder(order: OrderRequest): Promise<OrderResponse>;
    cancelOrder(orderId: string): Promise<boolean>;
    getOrderStatus(orderId: string): Promise<OrderResponse | null>;
    private checkRateLimit;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=rest.d.ts.map