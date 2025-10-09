import { Logger } from 'winston';
import { GatewayConfig } from './config';
import { Broker } from './broker';
import { MarketDataGateway } from './socket';
import { PrivateStreamHandler } from './private';
import { RestClient } from './rest';
import { ClickHouseClient } from './clickhouse';
export declare class GatewayServer {
    private app;
    private server;
    private wss;
    private logger;
    private config;
    private broker;
    private marketGateway;
    private privateStream;
    private restClient;
    private clickhouse;
    private connectedClients;
    constructor(config: GatewayConfig, broker: Broker, marketGateway: MarketDataGateway, privateStream: PrivateStreamHandler, restClient: RestClient, clickhouse: ClickHouseClient, logger: Logger);
    private setupMiddleware;
    private setupRoutes;
    private validateBundle;
    start(): Promise<void>;
    private setupWebSocketServer;
    private handleWebSocketMessage;
    private handleSubscribe;
    private handleUnsubscribe;
    private sendMarketData;
    broadcast(data: any): void;
}
//# sourceMappingURL=server.d.ts.map