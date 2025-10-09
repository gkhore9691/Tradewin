import { createWriteStream, createReadStream } from 'fs';
import { Socket } from 'net';
import { Logger } from 'winston';
import { TopOfBook, OrderBundle } from './schemas';
import { ulid } from 'ulid';

export class UDSClient {
  private socket: Socket | null = null;
  private logger: Logger;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private ticksSent = 0;
  private lastStatsLog = Date.now();
  private opportunityCallback: ((bundle: OrderBundle) => void) | null = null;

  constructor(private socketPath: string, logger: Logger) {
    this.logger = logger;
  }

  setOpportunityCallback(callback: (bundle: OrderBundle) => void): void {
    this.opportunityCallback = callback;
  }

  async connect(): Promise<void> {
    try {
      this.logger.info(`Connecting to engine UDS at ${this.socketPath}`);
      
      this.socket = new Socket();
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('UDS connection timeout'));
        }, 5000);

        this.socket!.on('connect', () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          this.logger.info('Connected to engine UDS');
          resolve();
        });

        this.socket!.on('error', (error) => {
          clearTimeout(timeout);
          this.logger.error('UDS connection error:', error);
          reject(error);
        });

        this.socket!.connect(this.socketPath);
      });

      this.setupEventHandlers();

    } catch (error) {
      this.logger.error('Failed to connect to engine UDS:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

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

  private async attemptReconnect(): Promise<void> {
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
      } catch (error) {
        this.logger.error('UDS reconnection failed:', error);
      }
    }, delay);
  }

  sendTick(tick: TopOfBook): void {
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
      
    } catch (error) {
      this.logger.error('Failed to send tick to engine:', error);
    }
  }

  sendMarketMeta(meta: any): void {
    if (!this.connected || !this.socket) {
      this.logger.warn('Cannot send market meta - UDS not connected');
      return;
    }

    try {
      const message = {
        message_type: 'market_meta',
        ...meta
      };
      const json = JSON.stringify(message);
      const buffer = Buffer.from(json, 'utf8');
      
      // Send length prefix + data
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(buffer.length, 0);
      
      this.socket.write(lengthBuffer);
      this.socket.write(buffer);
      
      this.logger.debug('Sent market meta to engine', { market: meta.market });
    } catch (error) {
      this.logger.error('Failed to send market meta to engine:', error);
    }
  }

  private handleEngineResponse(data: Buffer): void {
    try {
      // Parse length prefix
      if (data.length < 4) return;
      
      const length = data.readUInt32BE(0);
      if (data.length < 4 + length) return;
      
      const payload = data.slice(4, 4 + length);
      const orderBundle = this.deserializeOrderBundle(payload);
      
      // Forward to callback (server will broadcast to frontend)
      if (this.opportunityCallback) {
        this.opportunityCallback(orderBundle);
      }
      
    } catch (error) {
      this.logger.error('Failed to parse engine response:', error);
    }
  }

  private serializeTick(tick: TopOfBook): Buffer {
    // Simple JSON serialization for now
    // In production, use Protobuf or FlatBuffers
    const message = {
      message_type: 'tick',
      ...tick
    };
    const json = JSON.stringify(message);
    return Buffer.from(json, 'utf8');
  }

  private deserializeOrderBundle(data: Buffer): OrderBundle {
    // Simple JSON deserialization for now
    // In production, use Protobuf or FlatBuffers
    const json = data.toString('utf8');
    return JSON.parse(json);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}
