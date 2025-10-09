"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicRestClient = void 0;
const axios_1 = __importDefault(require("axios"));
class PublicRestClient {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.client = axios_1.default.create({
            baseURL: config.exchange.publicBase,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ArbitrageBot/1.0.0'
            }
        });
        this.setupInterceptors();
    }
    setupInterceptors() {
        // Response interceptor for error handling
        this.client.interceptors.response.use((response) => response, (error) => {
            this.logger.error('Public REST API error:', {
                url: error.config?.url,
                method: error.config?.method,
                status: error.response?.status,
                data: error.response?.data
            });
            return Promise.reject(error);
        });
    }
    async getOrderBookSnapshot(pair) {
        try {
            const response = await this.client.get('/market_data/orderbook', {
                params: { pair }
            });
            return {
                bids: response.data.bids,
                asks: response.data.asks
            };
        }
        catch (error) {
            this.logger.error('Failed to fetch order book snapshot:', error);
            throw error;
        }
    }
    async getTradeHistory(pair, limit = 100) {
        try {
            const response = await this.client.get('/market_data/trade_history', {
                params: { pair, limit }
            });
            return response.data.map((trade) => ({
                p: trade.p,
                q: trade.q,
                s: trade.s,
                T: trade.T,
                m: trade.m
            }));
        }
        catch (error) {
            this.logger.error('Failed to fetch trade history:', error);
            throw error;
        }
    }
    async getCandles(pair, interval, startTime, endTime, limit) {
        try {
            const params = { pair, interval };
            if (startTime)
                params.startTime = startTime;
            if (endTime)
                params.endTime = endTime;
            if (limit)
                params.limit = limit;
            const response = await this.client.get('/market_data/candles', { params });
            return response.data.map((candle) => ({
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
                time: candle.time
            }));
        }
        catch (error) {
            this.logger.error('Failed to fetch candles:', error);
            throw error;
        }
    }
    async healthCheck() {
        try {
            // Try to fetch a simple endpoint to check if the service is up
            const response = await this.client.get('/market_data/orderbook', {
                params: { pair: 'B-BTC_USDT' }
            });
            return response.status === 200;
        }
        catch (error) {
            this.logger.error('Public REST health check failed:', error);
            return false;
        }
    }
}
exports.PublicRestClient = PublicRestClient;
//# sourceMappingURL=public-rest.js.map