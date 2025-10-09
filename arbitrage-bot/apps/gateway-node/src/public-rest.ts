import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';
import { GatewayConfig } from './config';

export interface OrderBookSnapshot {
  bids: Record<string, string>; // price -> quantity
  asks: Record<string, string>; // price -> quantity
}

export interface PublicTrade {
  p: number;   // price
  q: number;   // quantity
  s: string;   // symbol
  T: number;   // timestamp (ms)
  m: boolean;  // is_maker
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export class PublicRestClient {
  private client: AxiosInstance;
  private logger: Logger;
  private config: GatewayConfig;

  constructor(config: GatewayConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    this.client = axios.create({
      baseURL: config.exchange.publicBase,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ArbitrageBot/1.0.0'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('Public REST API error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  async getOrderBookSnapshot(pair: string): Promise<OrderBookSnapshot> {
    try {
      const response = await this.client.get('/market_data/orderbook', {
        params: { pair }
      });
      
      return {
        bids: response.data.bids,
        asks: response.data.asks
      };
      
    } catch (error) {
      this.logger.error('Failed to fetch order book snapshot:', error);
      throw error;
    }
  }

  async getTradeHistory(pair: string, limit: number = 100): Promise<PublicTrade[]> {
    try {
      const response = await this.client.get('/market_data/trade_history', {
        params: { pair, limit }
      });
      
      return response.data.map((trade: any) => ({
        p: trade.p,
        q: trade.q,
        s: trade.s,
        T: trade.T,
        m: trade.m
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch trade history:', error);
      throw error;
    }
  }

  async getCandles(
    pair: string, 
    interval: '1m' | '5m' | '60m' | '1D',
    startTime?: number,
    endTime?: number,
    limit?: number
  ): Promise<Candle[]> {
    try {
      const params: any = { pair, interval };
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      if (limit) params.limit = limit;

      const response = await this.client.get('/market_data/candles', { params });
      
      return response.data.map((candle: any) => ({
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        time: candle.time
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch candles:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Try to fetch a simple endpoint to check if the service is up
      const response = await this.client.get('/market_data/orderbook', {
        params: { pair: 'B-BTC_USDT' }
      });
      return response.status === 200;
    } catch (error) {
      this.logger.error('Public REST health check failed:', error);
      return false;
    }
  }
}
