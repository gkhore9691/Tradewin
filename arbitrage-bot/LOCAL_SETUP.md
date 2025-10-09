# Local Development Setup Guide

This guide will help you set up and test the arbitrage trading bot locally.

## 📋 Prerequisites

1. **Node.js 18+**
2. **Rust 1.75+**
3. **Docker & Docker Compose**
4. **Git**

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install Node.js dependencies
cd /Users/mac/Tradewin/arbitrage-bot
npm install

# Install Rust dependencies
cd apps/engine-rust
cargo build

# Go back to root
cd ../..
```

### 2. Environment Setup

```bash
# Copy environment template
cp apps/gateway-node/env.example apps/gateway-node/.env

# Edit the environment file
nano apps/gateway-node/.env
```

### 3. Start Infrastructure Services

```bash
# Start ClickHouse, Prometheus, and Grafana
cd infra/docker
docker-compose up -d clickhouse prometheus grafana

# Wait for services to be ready
sleep 30
```

### 4. Build and Start Applications

```bash
# Build gateway
cd ../../apps/gateway-node
npm run build

# Start gateway (in one terminal)
npm run dev

# Build and start engine (in another terminal)
cd ../engine-rust
cargo run
```

## 🔧 Detailed Setup

### Environment Configuration

Edit `apps/gateway-node/.env`:

```bash
# Exchange Configuration (CoinDCX)
EXCHANGE_REST_BASE=https://api.coindcx.com
EXCHANGE_PUBLIC_BASE=https://public.coindcx.com
EXCHANGE_WS_PUBLIC=wss://stream.coindcx.com
EXCHANGE_WS_PRIVATE=wss://stream.coindcx.com
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_API_SECRET=your_api_secret_here

# Gateway Configuration
WS_TRANSPORT=websocket
WS_VERSION_PIN=2.4.0
ORDER_TIF=IOC
AGGRESSIVE_EPS_BPS=2
BID_ASK_LEVELS=5
DEPTH_SLIP_BUFFER=0.02

# Engine Configuration
ENTRY_THRESHOLD_BPS=8
COOLDOWN_MS=250
FEE_TAKER_BPS=20
MIN_FILL_FRACTION_L1=0.85
MIN_FILL_FRACTION_L2=0.90
TRIANGLE_CAP_INR=10000
SYMBOL_CAP_INR=30000

# Risk Management
REJECT_RATE_LIMIT_BPS=500
SLIPPAGE_LIMIT_BPS=15

# ClickHouse Configuration
CH_DSN=http://localhost:8123
CH_DB=arb

# Server Configuration
PORT=3000
HOST=0.0.0.0

# UDS Configuration
UDS_ENGINE_PATH=/tmp/arb_engine.sock

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

### Service URLs

Once running, you can access:

- **Gateway API**: http://localhost:3000
- **Health Check**: http://localhost:3000/healthz
- **Metrics**: http://localhost:3000/metrics
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **ClickHouse**: http://localhost:8123

## 🧪 Testing

### 1. Health Checks

```bash
# Check gateway health
curl http://localhost:3000/healthz

# Check readiness
curl http://localhost:3000/readyz

# Check metrics
curl http://localhost:3000/metrics
```

### 2. API Testing

```bash
# Get markets (requires API key)
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/markets

# Get market details
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/market-details

# Get balances
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/balances
```

### 3. Manual Order Bundle Test

```bash
curl -X POST http://localhost:3000/bundles \
  -H "Content-Type: application/json" \
  -d '{
    "triangle_id": "BTC:STRAIGHT",
    "route": "STRAIGHT",
    "expected_edge": 0.001,
    "capital_inr": 1000,
    "risk_token": "test-token-123",
    "ts_engine_ns": 1640995200000000000,
    "legs": [
      {
        "market": "USDTINR",
        "side": "BUY",
        "price": 82.5,
        "qty": 12.12,
        "time_in_force": "IOC",
        "intent": "TAKER",
        "vwap_price": 82.5,
        "worst_price": 82.6,
        "impact_bps": 5,
        "levels_used": 2
      },
      {
        "market": "BTCUSDT",
        "side": "BUY", 
        "price": 45000,
        "qty": 0.001,
        "time_in_force": "IOC",
        "intent": "TAKER",
        "vwap_price": 45000,
        "worst_price": 45050,
        "impact_bps": 8,
        "levels_used": 1
      },
      {
        "market": "BTCINR",
        "side": "SELL",
        "price": 3712500,
        "qty": 0.001,
        "time_in_force": "IOC", 
        "intent": "TAKER",
        "vwap_price": 3712500,
        "worst_price": 3712000,
        "impact_bps": 6,
        "levels_used": 1
      }
    ]
  }'
```

## 🔍 Monitoring

### Grafana Dashboards

1. Open http://localhost:3001
2. Login with admin/admin
3. Import dashboards from `observability/grafana/`

### Prometheus Metrics

Key metrics to monitor:
- `decision_latency_ns` - Decision making latency
- `triangles_evaluated_total` - Triangle evaluation count
- `signals_emitted_total` - Trading signals emitted
- `order_rejects_total` - Order rejection count

### ClickHouse Queries

```sql
-- Check recent ticks
SELECT * FROM ticks ORDER BY ts DESC LIMIT 10;

-- Check recent decisions
SELECT * FROM decisions ORDER BY ts DESC LIMIT 10;

-- Check orders
SELECT * FROM orders ORDER BY ts DESC LIMIT 10;
```

## 🐛 Troubleshooting

### Common Issues

1. **UDS Socket Issues**
   ```bash
   # Check if socket exists
   ls -la /tmp/arb_engine.sock
   
   # Remove if exists and restart
   rm -f /tmp/arb_engine.sock
   ```

2. **ClickHouse Connection**
   ```bash
   # Check ClickHouse status
   docker-compose logs clickhouse
   
   # Test connection
   curl http://localhost:8123/ping
   ```

3. **Engine Compilation**
   ```bash
   cd apps/engine-rust
   cargo clean
   cargo build --release
   ```

4. **Gateway Build Issues**
   ```bash
   cd apps/gateway-node
   rm -rf node_modules dist
   npm install
   npm run build
   ```

### Logs

```bash
# Gateway logs
tail -f apps/gateway-node/logs/gateway.log

# Engine logs (if using file logging)
tail -f apps/engine-rust/logs/engine.log

# Docker logs
docker-compose logs -f
```

## 🔧 Development Mode

### Hot Reloading

```bash
# Gateway with hot reload
cd apps/gateway-node
npm run dev

# Engine with hot reload (requires cargo-watch)
cd apps/engine-rust
cargo install cargo-watch
cargo watch -x run
```

### Testing Framework

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run Rust tests
cd apps/engine-rust
cargo test
```

## 📊 Performance Testing

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Run load test
artillery run tests/load-test.yml
```

### Latency Testing

```bash
# Test decision latency
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/healthz

# Create curl-format.txt:
# time_namelookup:  %{time_namelookup}\n
# time_connect:     %{time_connect}\n
# time_appconnect:  %{time_appconnect}\n
# time_pretransfer: %{time_pretransfer}\n
# time_redirect:    %{time_redirect}\n
# time_starttransfer: %{time_starttransfer}\n
# time_total:       %{time_total}\n
```

## 🚀 Production Simulation

### Docker Compose (Full Stack)

```bash
cd infra/docker
docker-compose up -d
```

### Kubernetes (Local)

```bash
# Install minikube
brew install minikube
minikube start

# Deploy to Kubernetes
kubectl apply -f infra/k8s/
```

## 📝 Next Steps

1. **Get CoinDCX API credentials**
2. **Configure real market data feeds**
3. **Test with paper trading**
4. **Monitor performance metrics**
5. **Tune parameters based on results**

---

**Happy Trading!** 🚀

