import { Logger } from 'winston';
import { TopOfBook } from './schemas';
export declare class UDSClient {
    private socketPath;
    private socket;
    private logger;
    private connected;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private ticksSent;
    private lastStatsLog;
    constructor(socketPath: string, logger: Logger);
    connect(): Promise<void>;
    private setupEventHandlers;
    private attemptReconnect;
    sendTick(tick: TopOfBook): void;
    private handleEngineResponse;
    private serializeTick;
    private deserializeOrderBundle;
    isConnected(): boolean;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=uds.d.ts.map