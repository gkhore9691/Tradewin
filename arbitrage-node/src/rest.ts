import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from 'winston';
import { Decimal } from '@arbitrage/utils';
import { GatewayConfig } from './config';
import { ulid } from '@arbitrage/utils';

export interface OrderRequest {
  market: string;
  side: 'BUY' | 'SELL';
  qty: Decimal;
  price?: Decimal;
  timeInForce: 'IOC' | 'FOK' | 'GTC';
  clientOrderId: string;
}

export interface OrderResponse {
  orderId: string;
  clientOrderId: string;
  market: string;
  side: string;
  qty: Decimal;
  price: Decimal;
  status: string;
  timestamp: number;
}

export interface Balance {
  asset: string;
  available: Decimal;
  locked: Decimal;
}

export interface MarketInfo {
  market: string;
  base: string;
  quote: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQty: Decimal;
  minNotional: Decimal;
  maxQty?: Decimal;
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
    const timestamp = Date.now();
    const nonce = ulid();
    
    // CoinDCX signature logic would go here
    // This is a simplified version
    const signature = await this.generateSignature(config, timestamp, nonce);
    
    config.headers = {
      ...config.headers,
      'X-AUTH-APIKEY': this.config.exchange.apiKey,
      'X-AUTH-SIGNATURE': signature,
      'X-AUTH-TIMESTAMP': timestamp.toString(),
      'X-AUTH-NONCE': nonce
    };
  }

  private async generateSignature(config: AxiosRequestConfig, timestamp: number, nonce: string): Promise<string> {
    // Implement CoinDCX signature generation
    // This is a placeholder - actual implementation depends on exchange API
    const crypto = await import('crypto');
    
    const body = config.data ? JSON.stringify(config.data) : '';
    const message = `${config.method?.toUpperCase()}|${config.url}|${body}|${timestamp}|${nonce}`;
    
    return crypto.createHmac('sha256', this.config.exchange.apiSecret)
      .update(message)
      .digest('hex');
  }

  async getBalances(): Promise<Balance[]> {
    try {
      const response = await this.client.get('/balances');
      
      return response.data.map((balance: any) => ({
        asset: balance.currency,
        available: new Decimal(balance.balance),
        locked: new Decimal(balance.locked || 0)
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch balances:', error);
      throw error;
    }
  }

  async getMarkets(): Promise<MarketInfo[]> {
    try {
      const response = await this.client.get('/markets');
      
      return response.data.map((market: any) => ({
        market: market.symbol,
        base: market.base_currency_short_name,
        quote: market.quote_currency_short_name,
        pricePrecision: market.price_precision,
        quantityPrecision: market.quantity_precision,
        minQty: new Decimal(market.min_quantity),
        minNotional: new Decimal(market.min_notional || 0),
        maxQty: market.max_quantity ? new Decimal(market.max_quantity) : undefined
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch markets:', error);
      throw error;
    }
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      // Check rate limits
      await this.checkRateLimit('order');
      
      const orderData = {
        market: order.market,
        side: order.side,
        order_type: order.price ? 'limit_order' : 'market_order',
        total_quantity: order.qty.toString(),
        price_per_unit: order.price?.toString(),
        client_order_id: order.clientOrderId,
        time_in_force: order.timeInForce
      };

      const response = await this.client.post('/orders', orderData);
      
      return {
        orderId: response.data.id,
        clientOrderId: response.data.client_order_id,
        market: response.data.market,
        side: response.data.side,
        qty: new Decimal(response.data.total_quantity),
        price: new Decimal(response.data.price_per_unit),
        status: response.data.status,
        timestamp: response.data.created_at
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
      
      await this.client.delete(`/orders/${orderId}`);
      return true;
      
    } catch (error) {
      this.logger.error('Failed to cancel order:', error);
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse | null> {
    try {
      const response = await this.client.get(`/orders/${orderId}`);
      
      return {
        orderId: response.data.id,
        clientOrderId: response.data.client_order_id,
        market: response.data.market,
        side: response.data.side,
        qty: new Decimal(response.data.total_quantity),
        price: new Decimal(response.data.price_per_unit),
        status: response.data.status,
        timestamp: response.data.updated_at
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
      const response = await this.client.get('/ping');
      return response.status === 200;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }
}

