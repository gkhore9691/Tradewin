import { io, Socket } from 'socket.io-client';
import { Logger } from 'winston';
import { ulid } from 'ulid';
import { GatewayConfig } from './config';
import { Execution, Balance } from './schemas';
import { ClickHouseClient } from './clickhouse';

export class PrivateStreamHandler {
  private socket: Socket | null = null;
  private logger: Logger;
  private config: GatewayConfig;
  private clickhouse: ClickHouseClient;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(config: GatewayConfig, clickhouse: ClickHouseClient, logger: Logger) {
    this.config = config;
    this.clickhouse = clickhouse;
    this.logger = logger;
  }

  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to CoinDCX private stream...');
      
      this.socket = io(this.config.exchange.wsPrivate, {
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
      
      await new Promise<void>((resolve, reject) => {
        this.socket!.on('connect', () => {
          this.logger.info('Connected to CoinDCX private stream');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          this.logger.error('Failed to connect to CoinDCX private stream:', error);
          reject(error);
        });

        this.socket!.connect();
      });

      await this.authenticate();
      
    } catch (error) {
      this.logger.error('Failed to connect to private stream:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

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
    this.socket.on('order_update', (data: any) => {
      this.handleOrderUpdate(data);
    });

    // Handle trade fills
    this.socket.on('trade_fill', (data: any) => {
      this.handleTradeFill(data);
    });

    // Handle balance updates
    this.socket.on('balance_update', (data: any) => {
      this.handleBalanceUpdate(data);
    });

    // Handle user data stream
    this.socket.on('user_data', (data: any) => {
      this.handleUserData(data);
    });
  }

  private async authenticate(): Promise<void> {
    if (!this.socket || !this.socket.connected) return;

    try {
      const timestamp = Date.now();
      const nonce = ulid();
      
      // Generate authentication signature
      const signature = await this.generateAuthSignature(timestamp, nonce);
      
      this.socket.emit('auth', {
        api_key: this.config.exchange.apiKey,
        signature,
        timestamp,
        nonce
      });

      this.logger.info('Authentication sent to private stream');
      
    } catch (error) {
      this.logger.error('Failed to authenticate private stream:', error);
      throw error;
    }
  }

  private async generateAuthSignature(timestamp: number, nonce: string): Promise<string> {
    const crypto = await import('crypto');
    
    const message = `auth|${timestamp}|${nonce}`;
    
    return crypto.createHmac('sha256', this.config.exchange.apiSecret)
      .update(message)
      .digest('hex');
  }

  private handleOrderUpdate(data: any): void {
    try {
      const execution: Execution = {
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

    } catch (error) {
      this.logger.error('Error handling order update:', error);
    }
  }

  private handleTradeFill(data: any): void {
    try {
      const execution: Execution = {
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

    } catch (error) {
      this.logger.error('Error handling trade fill:', error);
    }
  }

  private handleBalanceUpdate(data: any): void {
    try {
      const balance: Balance = {
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

    } catch (error) {
      this.logger.error('Error handling balance update:', error);
    }
  }

  private handleUserData(data: any): void {
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
    } catch (error) {
      this.logger.error('Error handling user data:', error);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
