import { Logger } from 'winston';
import { Decimal } from 'decimal.js';
import { OrderBundle } from './schemas';
import { GatewayConfig } from './config';
import { RestClient } from './rest';
import { ClickHouseClient } from './clickhouse';
export interface BrokerMetrics {
    ordersPlaced: number;
    ordersFilled: number;
    ordersRejected: number;
    totalVolume: Decimal;
    totalFees: Decimal;
    pnl: Decimal;
}
export declare class Broker {
    private logger;
    private config;
    private restClient;
    private clickhouse;
    private metrics;
    private activeOrders;
    constructor(config: GatewayConfig, restClient: RestClient, clickhouse: ClickHouseClient, logger: Logger);
    executeBundle(bundle: OrderBundle): Promise<{
        success: boolean;
        orders: string[];
        error?: string;
    }>;
    private executeLeg;
    private estimateFillFraction;
    private hedgeExposure;
    getMetrics(): BrokerMetrics;
    getActiveOrders(): Map<string, {
        bundle: OrderBundle;
        legIndex: number;
    }>;
    cancelOrder(orderId: string): Promise<boolean>;
    getOrderStatus(orderId: string): Promise<any>;
}
//# sourceMappingURL=broker.d.ts.map