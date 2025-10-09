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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestClient = void 0;
const axios_1 = __importDefault(require("axios"));
const decimal_js_1 = require("decimal.js");
class RestClient {
    constructor(config, logger) {
        this.rateLimiters = new Map();
        this.config = config;
        this.logger = logger;
        this.client = axios_1.default.create({
            baseURL: config.exchange.restBase,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ArbitrageBot/1.0.0'
            }
        });
        this.setupInterceptors();
    }
    setupInterceptors() {
        // Request interceptor for authentication
        this.client.interceptors.request.use(async (config) => {
            // Add authentication headers
            if (config.url?.includes('/order') || config.url?.includes('/balances')) {
                await this.addAuthHeaders(config);
            }
            return config;
        });
        // Response interceptor for error handling
        this.client.interceptors.response.use((response) => response, (error) => {
            this.logger.error('REST API error:', {
                url: error.config?.url,
                method: error.config?.method,
                status: error.response?.status,
                data: error.response?.data
            });
            return Promise.reject(error);
        });
    }
    async addAuthHeaders(config) {
        // CoinDCX uses HMAC-SHA256 over the raw JSON body
        const signature = await this.generateSignature(config);
        config.headers = {
            ...config.headers,
            'X-AUTH-APIKEY': this.config.exchange.apiKey,
            'X-AUTH-SIGNATURE': signature
        };
    }
    async generateSignature(config) {
        // CoinDCX signature: HMAC-SHA256 over the raw JSON body
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
        const body = config.data ? JSON.stringify(config.data, null, 0) : '{}';
        return crypto.createHmac('sha256', this.config.exchange.apiSecret)
            .update(body)
            .digest('hex');
    }
    async getBalances() {
        try {
            const timestamp = Date.now();
            const response = await this.client.post('/exchange/v1/users/balances', {
                timestamp
            });
            return response.data.map((balance) => ({
                currency: balance.currency,
                balance: balance.balance,
                locked_balance: balance.locked_balance || 0
            }));
        }
        catch (error) {
            this.logger.error('Failed to fetch balances:', error);
            throw error;
        }
    }
    async getMarkets() {
        try {
            const response = await this.client.get('/exchange/v1/markets');
            return response.data; // Returns array of market symbols
        }
        catch (error) {
            this.logger.error('Failed to fetch markets:', error);
            throw error;
        }
    }
    async getMarketDetails() {
        try {
            const response = await this.client.get('/exchange/v1/markets_details');
            return response.data.map((market) => ({
                coindcx_name: market.coindcx_name,
                symbol: market.symbol,
                ecode: market.ecode,
                pair: market.pair,
                base_currency_short_name: market.base_currency_short_name,
                target_currency_short_name: market.target_currency_short_name,
                base_currency_precision: market.base_currency_precision,
                target_currency_precision: market.target_currency_precision,
                min_quantity: new decimal_js_1.Decimal(market.min_quantity),
                max_quantity: market.max_quantity ? new decimal_js_1.Decimal(market.max_quantity) : undefined,
                min_price: new decimal_js_1.Decimal(market.min_price),
                max_price: market.max_price ? new decimal_js_1.Decimal(market.max_price) : undefined,
                min_notional: market.min_notional ? new decimal_js_1.Decimal(market.min_notional) : undefined,
                step: new decimal_js_1.Decimal(market.step),
                order_types: market.order_types,
                status: market.status
            }));
        }
        catch (error) {
            this.logger.error('Failed to fetch market details:', error);
            throw error;
        }
    }
    async placeOrder(order) {
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
        }
        catch (error) {
            this.logger.error('Failed to place order:', error);
            throw error;
        }
    }
    async cancelOrder(orderId) {
        try {
            // Check rate limits
            await this.checkRateLimit('cancel');
            const cancelData = {
                id: orderId,
                timestamp: Date.now()
            };
            await this.client.post('/exchange/v1/orders/cancel', cancelData);
            return true;
        }
        catch (error) {
            this.logger.error('Failed to cancel order:', error);
            return false;
        }
    }
    async getOrderStatus(orderId) {
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
        }
        catch (error) {
            this.logger.error('Failed to get order status:', error);
            return null;
        }
    }
    async checkRateLimit(operation) {
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
    async healthCheck() {
        try {
            // Use a valid endpoint that doesn't require authentication
            const response = await this.client.get('/exchange/v1/markets');
            return response.status === 200;
        }
        catch (error) {
            this.logger.error('Health check failed:', error);
            return false;
        }
    }
}
exports.RestClient = RestClient;
//# sourceMappingURL=rest.js.map