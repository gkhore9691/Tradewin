"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateStreamHandler = void 0;
const socket_io_client_1 = require("socket.io-client");
const ulid_1 = require("ulid");
class PrivateStreamHandler {
    constructor(config, clickhouse, logger) {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.config = config;
        this.clickhouse = clickhouse;
        this.logger = logger;
    }
    async connect() {
        try {
            this.logger.info('Connecting to CoinDCX private stream...');
            this.socket = (0, socket_io_client_1.io)(this.config.exchange.wsPrivate, {
                transports: ['websocket'],
                upgrade: false,
                rememberUpgrade: false,
                autoConnect: false,
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
                timeout: 10000
            });
            this.setupEventHandlers();
            await new Promise((resolve, reject) => {
                this.socket.on('connect', () => {
                    this.logger.info('Connected to CoinDCX private stream');
                    this.reconnectAttempts = 0;
                    resolve();
                });
                this.socket.on('connect_error', (error) => {
                    this.logger.error('Failed to connect to CoinDCX private stream:', error);
                    reject(error);
                });
                this.socket.connect();
            });
            await this.authenticate();
        }
        catch (error) {
            this.logger.error('Failed to connect to private stream:', error);
            throw error;
        }
    }
    setupEventHandlers() {
        if (!this.socket)
            return;
        this.socket.on('disconnect', (reason) => {
            this.logger.warn('Disconnected from CoinDCX private stream:', reason);
        });
        this.socket.on('reconnect', (attemptNumber) => {
            this.logger.info(`Reconnected to CoinDCX private stream after ${attemptNumber} attempts`);
            this.authenticate();
        });
        this.socket.on('reconnect_error', (error) => {
            this.logger.error('Private stream reconnection error:', error);
        });
        this.socket.on('reconnect_failed', () => {
            this.logger.error('Failed to reconnect to private stream after maximum attempts');
        });
        // Handle order updates
        this.socket.on('order_update', (data) => {
            this.handleOrderUpdate(data);
        });
        // Handle trade fills
        this.socket.on('trade_fill', (data) => {
            this.handleTradeFill(data);
        });
        // Handle balance updates
        this.socket.on('balance_update', (data) => {
            this.handleBalanceUpdate(data);
        });
        // Handle user data stream
        this.socket.on('user_data', (data) => {
            this.handleUserData(data);
        });
    }
    async authenticate() {
        if (!this.socket || !this.socket.connected)
            return;
        try {
            const timestamp = Date.now();
            const nonce = (0, ulid_1.ulid)();
            // Generate authentication signature
            const signature = await this.generateAuthSignature(timestamp, nonce);
            this.socket.emit('auth', {
                api_key: this.config.exchange.apiKey,
                signature,
                timestamp,
                nonce
            });
            this.logger.info('Authentication sent to private stream');
        }
        catch (error) {
            this.logger.error('Failed to authenticate private stream:', error);
            throw error;
        }
    }
    async generateAuthSignature(timestamp, nonce) {
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
        const message = `auth|${timestamp}|${nonce}`;
        return crypto.createHmac('sha256', this.config.exchange.apiSecret)
            .update(message)
            .digest('hex');
    }
    handleOrderUpdate(data) {
        try {
            const execution = {
                clientOrderId: data.client_order_id,
                market: data.market,
                side: data.side,
                price: parseFloat(data.price),
                qty: parseFloat(data.quantity),
                fee: parseFloat(data.fee || 0),
                feeAsset: data.fee_asset || 'INR',
                status: data.status,
                riskToken: data.risk_token || '',
                tsAckNs: Date.now() * 1000000,
                toxicFill: data.toxic_fill || false
            };
            // Store in ClickHouse
            this.clickhouse.insertExecution(execution);
            this.logger.info('Order update received:', {
                clientOrderId: execution.clientOrderId,
                market: execution.market,
                status: execution.status,
                qty: execution.qty,
                price: execution.price
            });
        }
        catch (error) {
            this.logger.error('Error handling order update:', error);
        }
    }
    handleTradeFill(data) {
        try {
            const execution = {
                clientOrderId: data.client_order_id,
                market: data.market,
                side: data.side,
                price: parseFloat(data.price),
                qty: parseFloat(data.quantity),
                fee: parseFloat(data.fee || 0),
                feeAsset: data.fee_asset || 'INR',
                status: 'FILLED',
                riskToken: data.risk_token || '',
                tsAckNs: Date.now() * 1000000,
                toxicFill: data.toxic_fill || false
            };
            // Store in ClickHouse
            this.clickhouse.insertExecution(execution);
            this.logger.info('Trade fill received:', {
                clientOrderId: execution.clientOrderId,
                market: execution.market,
                qty: execution.qty,
                price: execution.price,
                fee: execution.fee
            });
        }
        catch (error) {
            this.logger.error('Error handling trade fill:', error);
        }
    }
    handleBalanceUpdate(data) {
        try {
            const balance = {
                asset: data.currency,
                available: parseFloat(data.balance),
                locked: parseFloat(data.locked || '0'),
                tsNs: Date.now() * 1000000
            };
            // Store in ClickHouse
            this.clickhouse.insertBalance(balance);
            this.logger.debug('Balance update received:', {
                asset: balance.asset,
                available: balance.available.toString(),
                locked: balance.locked.toString()
            });
        }
        catch (error) {
            this.logger.error('Error handling balance update:', error);
        }
    }
    handleUserData(data) {
        try {
            // Handle various user data events
            switch (data.event_type) {
                case 'order_update':
                    this.handleOrderUpdate(data.data);
                    break;
                case 'trade_fill':
                    this.handleTradeFill(data.data);
                    break;
                case 'balance_update':
                    this.handleBalanceUpdate(data.data);
                    break;
                default:
                    this.logger.debug('Unknown user data event:', data);
            }
        }
        catch (error) {
            this.logger.error('Error handling user data:', error);
        }
    }
    isConnected() {
        return this.socket?.connected || false;
    }
    async disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}
exports.PrivateStreamHandler = PrivateStreamHandler;
//# sourceMappingURL=private.js.map