"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UDSClient = void 0;
const net_1 = require("net");
class UDSClient {
    constructor(socketPath, logger) {
        this.socketPath = socketPath;
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.ticksSent = 0;
        this.lastStatsLog = Date.now();
        this.logger = logger;
    }
    async connect() {
        try {
            this.logger.info(`Connecting to engine UDS at ${this.socketPath}`);
            this.socket = new net_1.Socket();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('UDS connection timeout'));
                }, 5000);
                this.socket.on('connect', () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.logger.info('Connected to engine UDS');
                    resolve();
                });
                this.socket.on('error', (error) => {
                    clearTimeout(timeout);
                    this.logger.error('UDS connection error:', error);
                    reject(error);
                });
                this.socket.connect(this.socketPath);
            });
            this.setupEventHandlers();
        }
        catch (error) {
            this.logger.error('Failed to connect to engine UDS:', error);
            throw error;
        }
    }
    setupEventHandlers() {
        if (!this.socket)
            return;
        this.socket.on('close', () => {
            this.connected = false;
            this.logger.warn('UDS connection closed');
            this.attemptReconnect();
        });
        this.socket.on('error', (error) => {
            this.logger.error('UDS error:', error);
            this.connected = false;
            this.attemptReconnect();
        });
        this.socket.on('data', (data) => {
            this.handleEngineResponse(data);
        });
    }
    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('Max UDS reconnection attempts reached');
            return;
        }
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        this.logger.info(`Attempting UDS reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        setTimeout(async () => {
            try {
                await this.connect();
            }
            catch (error) {
                this.logger.error('UDS reconnection failed:', error);
            }
        }, delay);
    }
    sendTick(tick) {
        if (!this.connected || !this.socket) {
            this.logger.warn('Cannot send tick - UDS not connected');
            return;
        }
        try {
            // Serialize tick to binary format
            const serialized = this.serializeTick(tick);
            // Send length prefix + data
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(serialized.length, 0);
            this.socket.write(lengthBuffer);
            this.socket.write(serialized);
            this.ticksSent++;
            // Log stats every 10 seconds
            const now = Date.now();
            if (now - this.lastStatsLog > 10000) {
                this.logger.info('📤 UDS stats', {
                    ticksSent: this.ticksSent,
                    ticksPerSecond: (this.ticksSent / 10).toFixed(1)
                });
                this.ticksSent = 0;
                this.lastStatsLog = now;
            }
        }
        catch (error) {
            this.logger.error('Failed to send tick to engine:', error);
        }
    }
    handleEngineResponse(data) {
        try {
            // Parse length prefix
            if (data.length < 4)
                return;
            const length = data.readUInt32BE(0);
            if (data.length < 4 + length)
                return;
            const payload = data.slice(4, 4 + length);
            const orderBundle = this.deserializeOrderBundle(payload);
            // Handle order bundle from engine
            this.logger.info('Received order bundle from engine:', {
                triangleId: orderBundle.triangle_id,
                route: orderBundle.route,
                expectedEdge: orderBundle.expected_edge,
                capitalInr: orderBundle.capital_inr
            });
            // TODO: Forward to order execution system
        }
        catch (error) {
            this.logger.error('Failed to parse engine response:', error);
        }
    }
    serializeTick(tick) {
        // Simple JSON serialization for now
        // In production, use Protobuf or FlatBuffers
        const message = {
            message_type: 'tick',
            ...tick
        };
        const json = JSON.stringify(message);
        return Buffer.from(json, 'utf8');
    }
    deserializeOrderBundle(data) {
        // Simple JSON deserialization for now
        // In production, use Protobuf or FlatBuffers
        const json = data.toString('utf8');
        return JSON.parse(json);
    }
    isConnected() {
        return this.connected;
    }
    async disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
            this.connected = false;
        }
    }
}
exports.UDSClient = UDSClient;
//# sourceMappingURL=uds.js.map