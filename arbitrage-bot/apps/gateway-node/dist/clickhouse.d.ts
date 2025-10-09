import { Logger } from 'winston';
import { GatewayConfig } from './config';
import { TopOfBook, OrderBundle, Execution, Balance } from './schemas';
export declare class ClickHouseClient {
    private client;
    private logger;
    private config;
    private batchSize;
    private flushInterval;
    private buffers;
    constructor(config: GatewayConfig, logger: Logger);
    private setupTables;
    private startBatchProcessor;
    private flushBuffers;
    insertTick(tick: TopOfBook): void;
    insertDecision(decision: OrderBundle): void;
    insertOrder(order: any): void;
    insertExecution(execution: Execution): void;
    insertBalance(balance: Balance): void;
    private insertTicks;
    private insertDecisions;
    private insertOrders;
    private insertFills;
    private insertBalances;
    healthCheck(): Promise<boolean>;
    close(): Promise<void>;
}
//# sourceMappingURL=clickhouse.d.ts.map