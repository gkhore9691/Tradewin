import { ClickHouse } from 'clickhouse';
import { Logger } from 'winston';
import { GatewayConfig } from './config';
import { TopOfBook, OrderBundle, Execution, Balance } from './schemas';

export class ClickHouseClient {
  private client: ClickHouse;
  private logger: Logger;
  private config: GatewayConfig;
  private batchSize = 1000;
  private flushInterval = 200; // ms
  private buffers = {
    ticks: [] as any[],
    decisions: [] as any[],
    orders: [] as any[],
    fills: [] as any[],
    balances: [] as any[]
  };

  constructor(config: GatewayConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    this.client = new ClickHouse({
      url: config.clickhouse.dsn,
      database: config.clickhouse.database,
      format: 'JSONEachRow',
      config: {
        session_timeout: 60,
        output_format_json_quote_64bit_integers: 0,
        enable_http_compression: 1
      }
    });

    this.setupTables();
    this.startBatchProcessor();
  }

  private async setupTables(): Promise<void> {
    try {
      // Create ticks table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS ticks (
          ts DateTime64(9),
          market String,
          bestBid Float64, 
          bestBidQty Float64,
          bestAsk Float64, 
          bestAskQty Float64,
          depthBid Array(Tuple(Float64,Float64)),
          depthAsk Array(Tuple(Float64,Float64)),
          src String DEFAULT 'gateway'
        ) ENGINE = MergeTree() 
        ORDER BY (ts, market)
        TTL ts + INTERVAL 30 DAY
      `);

      // Create decisions table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS decisions (
          ts DateTime64(9),
          triangle String, 
          route String,
          expectedEdge Float64,
          capitalINR Float64,
          legs Array(Tuple(String,String,Float64,Float64))
        ) ENGINE = MergeTree() 
        ORDER BY (ts, triangle)
        TTL ts + INTERVAL 90 DAY
      `);

      // Create orders table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          ts DateTime64(9),
          clientOrderId String,
          market String, 
          side String,
          price Float64, 
          qty Float64,
          status String, 
          riskToken String
        ) ENGINE = MergeTree() 
        ORDER BY (ts, market)
        TTL ts + INTERVAL 90 DAY
      `);

      // Create fills table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS fills (
          ts DateTime64(9),
          clientOrderId String,
          market String, 
          side String,
          price Float64, 
          qty Float64,
          fee Float64, 
          feeAsset String,
          toxicFill UInt8 DEFAULT 0
        ) ENGINE = MergeTree() 
        ORDER BY (ts, market)
        TTL ts + INTERVAL 90 DAY
      `);

      // Create balances table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS balances (
          ts DateTime64(9),
          asset String,
          available Float64,
          locked Float64
        ) ENGINE = MergeTree() 
        ORDER BY (ts, asset)
        TTL ts + INTERVAL 30 DAY
      `);

      this.logger.info('ClickHouse tables created/verified');

    } catch (error) {
      this.logger.error('Failed to setup ClickHouse tables:', error);
      throw error;
    }
  }

  private startBatchProcessor(): void {
    setInterval(() => {
      this.flushBuffers();
    }, this.flushInterval);
  }

  private async flushBuffers(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Flush ticks
    if (this.buffers.ticks.length > 0) {
      const ticks = [...this.buffers.ticks];
      this.buffers.ticks = [];
      promises.push(this.insertTicks(ticks));
    }

    // Flush decisions
    if (this.buffers.decisions.length > 0) {
      const decisions = [...this.buffers.decisions];
      this.buffers.decisions = [];
      promises.push(this.insertDecisions(decisions));
    }

    // Flush orders
    if (this.buffers.orders.length > 0) {
      const orders = [...this.buffers.orders];
      this.buffers.orders = [];
      promises.push(this.insertOrders(orders));
    }

    // Flush fills
    if (this.buffers.fills.length > 0) {
      const fills = [...this.buffers.fills];
      this.buffers.fills = [];
      promises.push(this.insertFills(fills));
    }

    // Flush balances
    if (this.buffers.balances.length > 0) {
      const balances = [...this.buffers.balances];
      this.buffers.balances = [];
      promises.push(this.insertBalances(balances));
    }

    await Promise.allSettled(promises);
  }

  insertTick(tick: TopOfBook): void {
    const record = {
      ts: new Date(tick.tsGatewayNs / 1000000),
      market: tick.market,
      bestBid: tick.bestBid,
      bestBidQty: tick.bestBidQty,
      bestAsk: tick.bestAsk,
      bestAskQty: tick.bestAskQty,
      depthBid: tick.depthBid.map(level => [level.px, level.qty]),
      depthAsk: tick.depthAsk.map(level => [level.px, level.qty]),
      src: 'gateway'
    };

    this.buffers.ticks.push(record);

    if (this.buffers.ticks.length >= this.batchSize) {
      this.flushBuffers();
    }
  }

  insertDecision(decision: OrderBundle): void {
    const record = {
      ts: new Date(decision.ts_engine_ns / 1000000),
      triangle: decision.triangle_id,
      route: decision.route,
      expectedEdge: decision.expected_edge,
      capitalINR: decision.capital_inr,
      legs: decision.legs.map(leg => [leg.market, leg.side, leg.price, leg.qty])
    };

    this.buffers.decisions.push(record);

    if (this.buffers.decisions.length >= this.batchSize) {
      this.flushBuffers();
    }
  }

  insertOrder(order: any): void {
    const record = {
      ts: new Date(),
      clientOrderId: order.clientOrderId,
      market: order.market,
      side: order.side,
      price: order.price,
      qty: order.qty,
      status: order.status,
      riskToken: order.riskToken || ''
    };

    this.buffers.orders.push(record);

    if (this.buffers.orders.length >= this.batchSize) {
      this.flushBuffers();
    }
  }

  insertExecution(execution: Execution): void {
    const record = {
      ts: new Date(execution.tsAckNs / 1000000),
      clientOrderId: execution.clientOrderId,
      market: execution.market,
      side: execution.side,
      price: execution.price,
      qty: execution.qty,
      fee: execution.fee,
      feeAsset: execution.feeAsset,
      toxicFill: execution.toxicFill ? 1 : 0
    };

    this.buffers.fills.push(record);

    if (this.buffers.fills.length >= this.batchSize) {
      this.flushBuffers();
    }
  }

  insertBalance(balance: Balance): void {
    const record = {
      ts: new Date(balance.tsNs / 1000000),
      asset: balance.asset,
      available: balance.available,
      locked: balance.locked
    };

    this.buffers.balances.push(record);

    if (this.buffers.balances.length >= this.batchSize) {
      this.flushBuffers();
    }
  }

  private async insertTicks(ticks: any[]): Promise<void> {
    try {
      await this.client.insert('ticks', ticks);
    } catch (error) {
      this.logger.error('Failed to insert ticks:', error);
    }
  }

  private async insertDecisions(decisions: any[]): Promise<void> {
    try {
      await this.client.insert('decisions', decisions);
    } catch (error) {
      this.logger.error('Failed to insert decisions:', error);
    }
  }

  private async insertOrders(orders: any[]): Promise<void> {
    try {
      await this.client.insert('orders', orders);
    } catch (error) {
      this.logger.error('Failed to insert orders:', error);
    }
  }

  private async insertFills(fills: any[]): Promise<void> {
    try {
      await this.client.insert('fills', fills);
    } catch (error) {
      this.logger.error('Failed to insert fills:', error);
    }
  }

  private async insertBalances(balances: any[]): Promise<void> {
    try {
      await this.client.insert('balances', balances);
    } catch (error) {
      this.logger.error('Failed to insert balances:', error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('ClickHouse health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.flushBuffers();
    // ClickHouse client doesn't have a close method
  }
}
