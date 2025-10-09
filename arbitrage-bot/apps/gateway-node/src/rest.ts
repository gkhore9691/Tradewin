import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from 'winston';
import { Decimal } from 'decimal.js';
import { GatewayConfig } from './config';

export interface OrderRequest {
  market: string;                    // "BTCINR" | "BTCUSDT" ...
  total_quantity: string;            // decimal as string
  price_per_unit?: string;           // required for limit orders
  side: 'buy' | 'sell';
  order_type: 'market_order' | 'limit_order' | 'stop_limit' | 'take_profit';
  client_order_id?: string;
  timestamp: number;                 // milliseconds
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
  currency: string;        // "BTC", "INR", "USDT"
  balance: number;         // free + locked
  locked_balance: number;  // in open orders
}

export interface MarketInfo {
  coindcx_name: string;                // e.g., "BTC/USDT"
  symbol: string;                      // e.g., "BTCUSDT"
  ecode: string;                       // "B" or partner code
  pair: string;                        // e.g., "B-BTC_USDT"
  base_currency_short_name: string;    // "BTC"
  target_currency_short_name: string;  // "USDT"
  base_currency_precision: number;
  target_currency_precision: number;
  min_quantity: Decimal;
  max_quantity?: Decimal;
  min_price: Decimal;
  max_price?: Decimal;
  min_notional?: Decimal;
  step: Decimal;                       // min tick increment for target qty
  order_types: string[];               // ["limit_order", "market_order", ...]
  status: string;                      // "Active" | "Inactive"
}

export class RestClient {
  private client: AxiosInstance;
  private logger: Logger;
  private config: GatewayConfig;
  private rateLimiters = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(config: GatewayConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    this.client = axios.create({
      baseURL: config.exchange.restBase,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ArbitrageBot/1.0.0'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.client.interceptors.request.use(async (config) => {
      // Add authentication headers
      if (config.url?.includes('/order') || config.url?.includes('/balances')) {
        await this.addAuthHeaders(config);
      }
      
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('REST API error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  private async addAuthHeaders(config: AxiosRequestConfig): Promise<void> {
    // CoinDCX uses HMAC-SHA256 over the raw JSON body
    const signature = await this.generateSignature(config);
    
    config.headers = {
      ...config.headers,
      'X-AUTH-APIKEY': this.config.exchange.apiKey,
      'X-AUTH-SIGNATURE': signature
    };
  }

  private async generateSignature(config: AxiosRequestConfig): Promise<string> {
    // CoinDCX signature: HMAC-SHA256 over the raw JSON body
    const crypto = await import('crypto');
    
    const body = config.data ? JSON.stringify(config.data, null, 0) : '{}';
    
    return crypto.createHmac('sha256', this.config.exchange.apiSecret)
      .update(body)
      .digest('hex');
  }

  async getBalances(): Promise<Balance[]> {
    try {
      const timestamp = Date.now();
      const response = await this.client.post('/exchange/v1/users/balances', {
        timestamp
      });
      
      return response.data.map((balance: any) => ({
        currency: balance.currency,
        balance: balance.balance,
        locked_balance: balance.locked_balance || 0
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch balances:', error);
      throw error;
    }
  }

  async getMarkets(): Promise<string[]> {
    try {
      const response = await this.client.get('/exchange/v1/markets');
      return response.data; // Returns array of market symbols
    } catch (error) {
      this.logger.error('Failed to fetch markets:', error);
      throw error;
    }
  }

  async getMarketDetails(): Promise<MarketInfo[]> {
    try {
      const response = await this.client.get('/exchange/v1/markets_details');
      
      return response.data.map((market: any) => ({
        coindcx_name: market.coindcx_name,
        symbol: market.symbol,
        ecode: market.ecode,
        pair: market.pair,
        base_currency_short_name: market.base_currency_short_name,
        target_currency_short_name: market.target_currency_short_name,
        base_currency_precision: market.base_currency_precision,
        target_currency_precision: market.target_currency_precision,
        min_quantity: new Decimal(market.min_quantity),
        max_quantity: market.max_quantity ? new Decimal(market.max_quantity) : undefined,
        min_price: new Decimal(market.min_price),
        max_price: market.max_price ? new Decimal(market.max_price) : undefined,
        min_notional: market.min_notional ? new Decimal(market.min_notional) : undefined,
        step: new Decimal(market.step),
        order_types: market.order_types,
        status: market.status
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch market details:', error);
      throw error;
    }
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      // Check rate limits
      await this.checkRateLimit('order');
      
      const orderData = {
        market: order.market,
        total_quantity: order.total_quantity,
        price_per_unit: order.price_per_unit,
        side: order.side,
        order_type: order.order_type,
        client_order_id: order.client_order_id,
        timestamp: order.timestamp
      };

      const response = await this.client.post('/exchange/v1/orders/create', orderData);
      
      // CoinDCX returns { orders: [OrderRecord] }
      const orderRecord = response.data.orders[0];
      
      return {
        id: orderRecord.id,
        client_order_id: orderRecord.client_order_id,
        market: orderRecord.market,
        order_type: orderRecord.order_type,
        side: orderRecord.side,
        status: orderRecord.status,
        fee_amount: orderRecord.fee_amount,
        fee: orderRecord.fee,
        total_quantity: orderRecord.total_quantity,
        remaining_quantity: orderRecord.remaining_quantity,
        avg_price: orderRecord.avg_price,
        price_per_unit: orderRecord.price_per_unit,
        created_at: orderRecord.created_at,
        updated_at: orderRecord.updated_at
      };
      
    } catch (error) {
      this.logger.error('Failed to place order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      // Check rate limits
      await this.checkRateLimit('cancel');
      
      const cancelData = {
        id: orderId,
        timestamp: Date.now()
      };
      
      await this.client.post('/exchange/v1/orders/cancel', cancelData);
      return true;
      
    } catch (error) {
      this.logger.error('Failed to cancel order:', error);
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse | null> {
    try {
      const statusData = {
        ids: [orderId],
        timestamp: Date.now()
      };
      
      const response = await this.client.post('/exchange/v1/orders/status_multiple', statusData);
      
      if (!response.data || response.data.length === 0) {
        return null;
      }
      
      const orderRecord = response.data[0];
      
      return {
        id: orderRecord.id,
        client_order_id: orderRecord.client_order_id,
        market: orderRecord.market,
        order_type: orderRecord.order_type,
        side: orderRecord.side,
        status: orderRecord.status,
        fee_amount: orderRecord.fee_amount,
        fee: orderRecord.fee,
        total_quantity: orderRecord.total_quantity,
        remaining_quantity: orderRecord.remaining_quantity,
        avg_price: orderRecord.avg_price,
        price_per_unit: orderRecord.price_per_unit,
        created_at: orderRecord.created_at,
        updated_at: orderRecord.updated_at
      };
      
    } catch (error) {
      this.logger.error('Failed to get order status:', error);
      return null;
    }
  }

  private async checkRateLimit(operation: string): Promise<void> {
    const now = Date.now();
    const rateLimiter = this.rateLimiters.get(operation) || { tokens: 0, lastRefill: now };
    
    // Refill tokens based on time elapsed
    const timeElapsed = now - rateLimiter.lastRefill;
    const tokensToAdd = Math.floor(timeElapsed / 1000); // 1 token per second
    
    rateLimiter.tokens = Math.min(rateLimiter.tokens + tokensToAdd, 10); // Max 10 tokens
    rateLimiter.lastRefill = now;
    
    if (rateLimiter.tokens < 1) {
      const waitTime = 1000 - (now % 1000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    rateLimiter.tokens--;
    this.rateLimiters.set(operation, rateLimiter);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Use a valid endpoint that doesn't require authentication
      const response = await this.client.get('/exchange/v1/markets');
      return response.status === 200;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }
}
