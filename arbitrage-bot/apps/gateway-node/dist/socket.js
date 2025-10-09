"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataGateway = void 0;
const socket_io_client_1 = require("socket.io-client");
const decimal_js_1 = require("decimal.js");
class MarketDataGateway {
    constructor(config, udsClient, restClient, logger) {
        this.socket = null;
        this.marketStates = new Map();
        this.orderBooks = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.wsDebug = process.env['WS_DEBUG'] === '1';
        this.tickCount = 0;
        this.lastStatsLog = Date.now();
        this.config = config;
        this.udsClient = udsClient;
        this.restClient = restClient;
        this.logger = logger;
    }
    async connect() {
        try {
            this.logger.info('Connecting to CoinDCX WebSocket...');
            this.socket = (0, socket_io_client_1.io)(this.config.exchange.wsPublic, {
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
                    this.logger.info('Connected to CoinDCX WebSocket');
                    this.reconnectAttempts = 0;
                    resolve();
                });
                this.socket.on('connect_error', (error) => {
                    this.logger.error('Failed to connect to CoinDCX WebSocket:', error);
                    reject(error);
                });
                this.socket.connect();
            });
            await this.subscribeToMarkets();
        }
        catch (error) {
            this.logger.error('Failed to connect to market data stream:', error);
            throw error;
        }
    }
    setupEventHandlers() {
        if (!this.socket)
            return;
        this.socket.on('disconnect', (reason) => {
            this.logger.warn('Disconnected from CoinDCX WebSocket:', reason);
        });
        this.socket.on('reconnect', (attemptNumber) => {
            this.logger.info(`Reconnected to CoinDCX WebSocket after ${attemptNumber} attempts`);
            this.subscribeToMarkets();
        });
        this.socket.on('reconnect_error', (error) => {
            this.logger.error('Reconnection error:', error);
        });
        this.socket.on('reconnect_failed', () => {
            this.logger.error('Failed to reconnect after maximum attempts');
        });
        // Handle CoinDCX Socket.IO order book messages
        // Support snapshot endpoint per docs: 'depth-snapshot'
        this.socket.on('depth-snapshot', (msg) => {
            try {
                const payload = typeof msg === 'string'
                    ? JSON.parse(msg)
                    : (msg && typeof msg.data === 'string')
                        ? JSON.parse(msg.data)
                        : msg;
                this.handleCoinDCXMessage(payload, true);
            }
            catch (e) {
                this.logger.warn('Failed to parse depth-snapshot message', { msg });
            }
        });
        // Process incremental updates
        this.socket.on('depth-update', (msg) => {
            try {
                const payload = typeof msg === 'string'
                    ? JSON.parse(msg)
                    : (msg && typeof msg.data === 'string')
                        ? JSON.parse(msg.data)
                        : msg;
                this.handleCoinDCXMessage(payload, false);
            }
            catch (e) {
                this.logger.warn('Failed to parse depth-update message', { msg });
            }
        });
        // Fallback in case provider sends generic 'message'
        this.socket.on('message', (data) => {
            this.handleCoinDCXMessage(data, false);
        });
        // Optional: log all socket events for debugging
        if (this.wsDebug) {
            this.socket.onAny((event, ...args) => {
                try {
                    const sample = Array.isArray(args) && args.length > 0 ? args[0] : undefined;
                    this.logger.info('[WS_DEBUG] event', { event, sample });
                }
                catch (_) {
                    // ignore logging errors
                }
            });
        }
    }
    async subscribeToMarkets() {
        if (!this.socket || !this.socket.connected)
            return;
        try {
            // Build the markets universe from configured symbols and exchange metadata
            // Required markets per symbol: XUSDT, XINR plus the bridge USDTINR
            const symbols = this.config.symbols;
            // Fetch market details to map symbols (e.g., BTCUSDT) to pairs (e.g., B-BTC_USDT)
            let marketDetails = [];
            try {
                const details = await this.restClient.getMarketDetails();
                marketDetails = details.map(d => ({ symbol: d.symbol, pair: d.pair }));
            }
            catch (e) {
                this.logger.warn('Failed to fetch market details; falling back to symbol-based subscription');
            }
            const derivedSymbols = new Set();
            derivedSymbols.add('USDTINR');
            for (const s of symbols) {
                derivedSymbols.add(`${s}USDT`);
                derivedSymbols.add(`${s}INR`);
            }
            // Select depth per docs: allowed values 10, 20, 50. Map our bidAskLevels to nearest allowed.
            const requested = this.config.ws.bidAskLevels;
            const depth = requested <= 10 ? 10 : requested <= 20 ? 20 : 50;
            // Build channels
            const symbolToPair = new Map(marketDetails.map(md => [md.symbol, md.pair]));
            const channels = Array.from(derivedSymbols).map(sym => {
                const pair = symbolToPair.get(sym);
                if (pair)
                    return `${pair}@orderbook@${depth}`;
                // Fallback construct pair when not found: handle USDT (4) and INR (3)
                let base;
                let quote;
                if (sym.endsWith('USDT')) {
                    base = sym.slice(0, -4);
                    quote = 'USDT';
                }
                else if (sym.endsWith('INR')) {
                    base = sym.slice(0, -3);
                    quote = 'INR';
                }
                else {
                    // Default to last 3 as quote if unknown
                    base = sym.slice(0, -3);
                    quote = sym.slice(-3);
                }
                return `B-${base}_${quote}@orderbook@${depth}`;
            });
            this.logger.info('Preparing to join channels', { symbols, depth, count: channels.length });
            for (const channelName of channels) {
                const payload = { channelName };
                this.logger.info('Emitting join event', { channelName });
                this.socket.emit('join', payload);
                // Immediately request a depth snapshot for this channel
                this.socket.emit('depth-snapshot', payload);
            }
            this.logger.info(`Subscribed to ${channels.length} channels`, { channels });
        }
        catch (error) {
            this.logger.error('Failed to subscribe to markets:', error);
            throw error;
        }
    }
    handleCoinDCXMessage(data, isSnapshot = false) {
        try {
            // CoinDCX Socket.IO message format:
            // {
            //   "ts": 1714653301197,         // event timestamp (ms)
            //   "vs": 10037615,              // version / sequence for book
            //   "asks": { "0.10828":"260", ... },
            //   "bids": { "0.10758":"38692.1224", ... },
            //   "E": 1714653301194,          // event time (book-specific)
            //   "pr": "spot",                // 'spot' or 'futures'
            //   "s": "BTCUSDT"               // symbol
            // }
            if (!data.s) {
                this.logger.warn('Invalid CoinDCX message format:', data);
                return;
            }
            const market = data.s;
            const timestamp = Date.now() * 1000000; // Convert to nanoseconds
            // Build/Update in-memory orderbook using snapshot/delta
            const book = this.getOrCreateBook(market);
            this.applySnapshotOrUpdate(book, data, isSnapshot);
            // Normalize top K levels from internal book
            const normalizedBook = this.materializeTopLevels(book, this.config.ws.bidAskLevels);
            if (!normalizedBook) {
                this.logger.warn(`Failed to normalize order book for ${market}`);
                return;
            }
            // Update market state
            const marketState = {
                market,
                asks: normalizedBook.asks,
                bids: normalizedBook.bids,
                bestBid: new decimal_js_1.Decimal(normalizedBook.bids[0]?.px || 0),
                bestAsk: new decimal_js_1.Decimal(normalizedBook.asks[0]?.px || 0),
                lastUpdateNs: timestamp,
                stale: false
            };
            this.marketStates.set(market, marketState);
            // Send to engine via UDS
            const topOfBook = {
                market,
                bestBid: marketState.bestBid.toNumber(),
                bestBidQty: normalizedBook.bids[0]?.qty || 0,
                bestAsk: marketState.bestAsk.toNumber(),
                bestAskQty: normalizedBook.asks[0]?.qty || 0,
                depthBid: normalizedBook.bids.slice(0, this.config.ws.bidAskLevels).map(level => ({
                    px: level.px,
                    qty: level.qty
                })),
                depthAsk: normalizedBook.asks.slice(0, this.config.ws.bidAskLevels).map(level => ({
                    px: level.px,
                    qty: level.qty
                })),
                tsExchangeNs: (data.ts || data.E || Date.now()) * 1000000, // Convert ms to ns
                tsGatewayNs: timestamp
            };
            this.udsClient.sendTick(topOfBook);
            this.tickCount++;
            // Log stats every 10 seconds
            const now = Date.now();
            if (now - this.lastStatsLog > 10000) {
                this.logger.info('📊 Gateway stats', {
                    ticksProcessed: this.tickCount,
                    activeMarkets: this.marketStates.size,
                    ticksPerSecond: (this.tickCount / 10).toFixed(1)
                });
                this.tickCount = 0;
                this.lastStatsLog = now;
            }
        }
        catch (error) {
            this.logger.error('Error handling CoinDCX message:', error);
        }
    }
    getOrCreateBook(market) {
        let book = this.orderBooks.get(market);
        if (!book) {
            book = { asks: new Map(), bids: new Map() };
            this.orderBooks.set(market, book);
        }
        return book;
    }
    applySnapshotOrUpdate(book, data, isSnapshot) {
        const applySide = (sideMap, sideObj, isAsk) => {
            if (!sideObj || typeof sideObj !== 'object')
                return;
            if (isSnapshot)
                sideMap.clear();
            for (const [priceStr, qtyStr] of Object.entries(sideObj)) {
                const price = Number(priceStr);
                const qty = Number(qtyStr);
                if (!(price > 0))
                    continue;
                if (qty <= 0) {
                    sideMap.delete(price);
                }
                else {
                    sideMap.set(price, qty);
                }
            }
        };
        applySide(book.asks, data.asks, true);
        applySide(book.bids, data.bids, false);
    }
    materializeTopLevels(book, k) {
        const asks = Array.from(book.asks.entries())
            .map(([px, qty]) => ({ px, qty }))
            .sort((a, b) => a.px - b.px)
            .slice(0, k);
        const bids = Array.from(book.bids.entries())
            .map(([px, qty]) => ({ px, qty }))
            .sort((a, b) => b.px - a.px)
            .slice(0, k);
        return { asks, bids };
    }
    getMarketState(market) {
        return this.marketStates.get(market);
    }
    getAllMarketStates() {
        return this.marketStates;
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
exports.MarketDataGateway = MarketDataGateway;
//# sourceMappingURL=socket.js.map