-- ClickHouse initialization script for arbitrage trading system

-- Create ticks table
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
SETTINGS index_granularity = 8192;

-- Create decisions table
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
SETTINGS index_granularity = 8192;

-- Create orders table
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
SETTINGS index_granularity = 8192;

-- Create fills table
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
SETTINGS index_granularity = 8192;

-- Create balances table
CREATE TABLE IF NOT EXISTS balances (
    ts DateTime64(9),
    asset String,
    available Float64,
    locked Float64
) ENGINE = MergeTree() 
ORDER BY (ts, asset)
TTL ts + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Create materialized view for real-time P&L calculation
CREATE MATERIALIZED VIEW IF NOT EXISTS pnl_summary
ENGINE = SummingMergeTree()
ORDER BY (date, triangle)
AS SELECT
    toDate(ts) as date,
    triangle,
    route,
    count() as signals,
    sum(expectedEdge * capitalINR) as expectedPnl,
    avg(expectedEdge) as avgEdge
FROM decisions
GROUP BY date, triangle, route;

-- Create materialized view for order performance
CREATE MATERIALIZED VIEW IF NOT EXISTS order_performance
ENGINE = SummingMergeTree()
ORDER BY (date, market)
AS SELECT
    toDate(ts) as date,
    market,
    side,
    count() as orders,
    sum(qty * price) as volume,
    sum(fee) as totalFees,
    sumIf(1, status = 'FILLED') as filledOrders,
    sumIf(1, toxicFill = 1) as toxicFills
FROM fills
GROUP BY date, market, side;

