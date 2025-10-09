import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Logger } from 'winston';
import { register } from 'prom-client';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GatewayConfig } from './config';
import { Broker } from './broker';
import { MarketDataGateway } from './socket';
import { PrivateStreamHandler } from './private';
import { RestClient } from './rest';
import { ClickHouseClient } from './clickhouse';
import { OrderBundle } from './schemas';

export class GatewayServer {
  private app: Express;
  private server!: any;
  private wss!: WebSocketServer;
  private logger: Logger;
  private config: GatewayConfig;
  private broker: Broker;
  private marketGateway: MarketDataGateway;
  private privateStream: PrivateStreamHandler;
  private restClient: RestClient;
  private clickhouse: ClickHouseClient;
  private connectedClients: Set<WebSocket> = new Set();

  constructor(
    config: GatewayConfig,
    broker: Broker,
    marketGateway: MarketDataGateway,
    privateStream: PrivateStreamHandler,
    restClient: RestClient,
    clickhouse: ClickHouseClient,
    logger: Logger
  ) {
    this.config = config;
    this.broker = broker;
    this.marketGateway = marketGateway;
    this.privateStream = privateStream;
    this.restClient = restClient;
    this.clickhouse = clickhouse;
    this.logger = logger;
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private setupRoutes(): void {
    // Health check endpoints
    this.app.get('/healthz', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/readyz', async (req: Request, res: Response) => {
      const checks = {
        marketGateway: this.marketGateway.isConnected(),
        privateStream: this.privateStream.isConnected(),
        clickhouse: await this.clickhouse.healthCheck(),
        restApi: await this.restClient.healthCheck()
      };

      const allHealthy = Object.values(checks).every(check => check === true);
      
      if (allHealthy) {
        res.json({ status: 'ready', checks });
      } else {
        res.status(503).json({ status: 'not ready', checks });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = await register.metrics();
        res.set('Content-Type', register.contentType);
        res.send(metrics);
      } catch (error) {
        this.logger.error('Error generating metrics:', error);
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    // Market data endpoints
    this.app.get('/markets', async (req: Request, res: Response) => {
      try {
        const markets = await this.restClient.getMarkets();
        res.json(markets);
      } catch (error) {
        this.logger.error('Error fetching markets:', error);
        res.status(500).json({ error: 'Failed to fetch markets' });
      }
    });

    this.app.get('/market-details', async (req: Request, res: Response) => {
      try {
        const marketDetails = await this.restClient.getMarketDetails();
        res.json(marketDetails);
      } catch (error) {
        this.logger.error('Error fetching market details:', error);
        res.status(500).json({ error: 'Failed to fetch market details' });
      }
    });

    this.app.get('/markets/:market/state', (req: Request, res: Response) => {
      const { market } = req.params;
      if (!market) {
        return res.status(400).json({ error: 'Market is required' });
      }
      const state = this.marketGateway.getMarketState(market);
      
      if (!state) {
        return res.status(404).json({ error: 'Market not found' });
      }
      
      res.json({
        market: state.market,
        bestBid: state.bestBid.toString(),
        bestAsk: state.bestAsk.toString(),
        lastUpdate: new Date(state.lastUpdateNs / 1000000).toISOString(),
        stale: state.stale
      });
    });

    // Balance endpoints
    this.app.get('/balances', async (req: Request, res: Response) => {
      try {
        const balances = await this.restClient.getBalances();
        res.json(balances.map(b => ({
          currency: b.currency,
          balance: b.balance,
          locked_balance: b.locked_balance
        })));
      } catch (error) {
        this.logger.error('Error fetching balances:', error);
        res.status(500).json({ error: 'Failed to fetch balances' });
      }
    });

    // Order endpoints
    this.app.post('/orders', async (req: Request, res: Response) => {
      try {
        const orderRequest = req.body;
        const orderResponse = await this.restClient.placeOrder(orderRequest);
        res.json(orderResponse);
      } catch (error) {
        this.logger.error('Error placing order:', error);
        res.status(500).json({ error: 'Failed to place order' });
      }
    });

    this.app.delete('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const { orderId } = req.params;
        if (!orderId) {
          return res.status(400).json({ error: 'orderId is required' });
        }
        const success = await this.broker.cancelOrder(orderId);
        res.json({ success });
      } catch (error) {
        this.logger.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
      }
    });

    this.app.get('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const { orderId } = req.params;
        if (!orderId) {
          return res.status(400).json({ error: 'orderId is required' });
        }
        const status = await this.broker.getOrderStatus(orderId);
        
        if (!status) {
          return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json(status);
      } catch (error) {
        this.logger.error('Error getting order status:', error);
        res.status(500).json({ error: 'Failed to get order status' });
      }
    });

    // Bundle execution endpoint
    this.app.post('/bundles', async (req: Request, res: Response) => {
      try {
        const bundleData = req.body as OrderBundle;
        
        // Validate bundle
        if (!this.validateBundle(bundleData)) {
          return res.status(400).json({ error: 'Invalid bundle format' });
        }

        const result = await this.broker.executeBundle(bundleData);
        
        if (result.success) {
          res.json({
            success: true,
            orders: result.orders,
            message: 'Bundle executed successfully'
          });
        } else {
          res.status(400).json({
            success: false,
            orders: result.orders,
            error: result.error
          });
        }
      } catch (error) {
        this.logger.error('Error executing bundle:', error);
        res.status(500).json({ error: 'Failed to execute bundle' });
      }
    });

    // Broker metrics endpoint
    this.app.get('/metrics/broker', (req: Request, res: Response) => {
      const metrics = this.broker.getMetrics();
      const activeOrders = this.broker.getActiveOrders();
      
      res.json({
        metrics: {
          ordersPlaced: metrics.ordersPlaced,
          ordersFilled: metrics.ordersFilled,
          ordersRejected: metrics.ordersRejected,
          totalVolume: metrics.totalVolume.toString(),
          totalFees: metrics.totalFees.toString(),
          pnl: metrics.pnl.toString()
        },
        activeOrders: Array.from(activeOrders.entries()).map(([token, data]) => ({
          riskToken: token,
          triangleId: data.bundle.triangle_id,
          route: data.bundle.route,
          legIndex: data.legIndex
        }))
      });
    });

    // Market states endpoint
    this.app.get('/markets/states', (req: Request, res: Response) => {
      const states = this.marketGateway.getAllMarketStates();
      const response = Array.from(states.entries()).map(([market, state]) => ({
        market: state.market,
        bestBid: state.bestBid.toString(),
        bestAsk: state.bestAsk.toString(),
        lastUpdate: new Date(state.lastUpdateNs / 1000000).toISOString(),
        stale: state.stale,
        asksCount: state.asks.length,
        bidsCount: state.bids.length
      }));
      
      res.json(response);
    });

    // Error handling middleware
    this.app.use((error: any, req: Request, res: Response, next: any) => {
      this.logger.error('Unhandled error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  private validateBundle(bundle: any): bundle is OrderBundle {
    return (
      bundle &&
      typeof bundle.triangle_id === 'string' &&
      typeof bundle.route === 'string' &&
      Array.isArray(bundle.legs) &&
      bundle.legs.length === 3 &&
      typeof bundle.expected_edge === 'number' &&
      typeof bundle.capital_inr === 'number' &&
      typeof bundle.risk_token === 'string'
    );
  }

  async start(): Promise<void> {
    // Create HTTP server
    this.server = createServer(this.app);
    
    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocketServer();
    
    // Start the server
    this.server.listen(this.config.server.port, this.config.server.host, () => {
      this.logger.info(`Gateway server started on ${this.config.server.host}:${this.config.server.port}`);
      this.logger.info(`WebSocket server available at ws://${this.config.server.host}:${this.config.server.port}`);
    });

    // Periodically broadcast latest market states to all clients
    setInterval(() => {
      const states = this.marketGateway.getAllMarketStates();
      states.forEach((state) => {
        const message = {
          type: 'orderbook',
          market: state.market,
          data: {
            market: state.market,
            bids: state.bids.map(l => ({ price: l.px, amount: l.qty })),
            asks: state.asks.map(l => ({ price: l.px, amount: l.qty })),
            timestamp: new Date(state.lastUpdateNs / 1000000).toISOString()
          }
        };
        this.broadcast(message);
      });
    }, 1000);

    // Note: Graceful shutdown is handled in index.ts
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.connectedClients.forEach(ws => {
        ws.close();
      });
      this.connectedClients.clear();

      // Close WebSocket server
      this.wss.close(() => {
        this.logger.info('WebSocket server closed');
      });

      // Close HTTP server
      this.server.close(() => {
        this.logger.info('HTTP server closed');
        resolve();
      });
    });
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.logger.info('New WebSocket client connected');
      this.connectedClients.add(ws);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          this.logger.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.logger.info('WebSocket client disconnected');
        this.connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });

      // Send welcome message
      ws.send(JSON.stringify({ 
        type: 'connected', 
        message: 'Connected to Arbitrage Bot Gateway',
        timestamp: new Date().toISOString()
      }));
    });
  }

  private handleWebSocketMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(ws, message);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws, message);
        break;
      default:
        this.logger.warn('Unknown WebSocket message type:', message.type);
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  private handleSubscribe(ws: WebSocket, message: any): void {
    const { market, data } = message;
    
    if (!market) {
      ws.send(JSON.stringify({ type: 'error', message: 'Market is required' }));
      return;
    }

    this.logger.info(`Client subscribed to ${market} ${data || 'data'}`);
    
    // Send current market data if available
    this.sendMarketData(ws, market);
    
    // Store subscription info (in a real implementation, you'd track this per client)
    ws.send(JSON.stringify({ 
      type: 'subscribed', 
      market: market,
      data: data,
      message: `Subscribed to ${market}`
    }));
  }

  private handleUnsubscribe(ws: WebSocket, message: any): void {
    const { market } = message;
    this.logger.info(`Client unsubscribed from ${market}`);
    
    ws.send(JSON.stringify({ 
      type: 'unsubscribed', 
      market: market,
      message: `Unsubscribed from ${market}`
    }));
  }

  private sendMarketData(ws: WebSocket, market: string): void {
    // Send latest known market state if available; otherwise send empty snapshot
    const state = this.marketGateway.getMarketState(market);
    const payload = {
      type: 'orderbook',
      market: market,
      data: {
        market,
        bids: state ? state.bids.map(l => ({ price: l.px, amount: l.qty })) : [],
        asks: state ? state.asks.map(l => ({ price: l.px, amount: l.qty })) : [],
        timestamp: state ? new Date(state.lastUpdateNs / 1000000).toISOString() : new Date().toISOString()
      }
    };

    ws.send(JSON.stringify(payload));
  }

  // Method to broadcast data to all connected clients
  public broadcast(data: any): void {
    const message = JSON.stringify(data);
    this.connectedClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Broadcast arbitrage opportunity to all connected clients
  public broadcastOpportunity(bundle: any): void {
    const message = {
      type: 'opportunity',
      data: {
        triangleId: bundle.triangle_id,
        route: bundle.route,
        edge: bundle.expected_edge,
        capitalInr: bundle.capital_inr,
        legs: bundle.legs,
        timestamp: new Date().toISOString()
      }
    };
    
    this.logger.info('📢 Broadcasting opportunity to frontend', {
      triangle: bundle.triangle_id,
      edge: bundle.expected_edge,
      clients: this.connectedClients.size
    });
    
    this.broadcast(message);
  }
}
