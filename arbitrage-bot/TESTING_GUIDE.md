# Arbitrage System Testing Guide

## 🚀 System Status
Your arbitrage system is now running with the following components:

### ✅ Running Services
1. **Rust Arbitrage Engine** - Ultra-low latency triangle arbitrage detection
2. **Gateway Node** - Market data processing and order execution
3. **ClickHouse Database** - Time-series data storage
4. **UDS Communication** - High-speed engine-gateway communication

## 🧪 Testing Endpoints

### 1. Health & Status Endpoints

```bash
# Basic health check
curl http://localhost:3000/healthz

# Detailed readiness check (checks all services)
curl http://localhost:3000/readyz

# System metrics
curl http://localhost:3000/metrics
```

### 2. Market Data Endpoints

```bash
# Get available markets
curl http://localhost:3000/markets

# Get market details
curl http://localhost:3000/market-details

# Get current market states
curl http://localhost:3000/markets/states

# Get specific market state (e.g., BTC-INR)
curl http://localhost:3000/markets/BTC-INR/state
```

### 3. Trading Endpoints

```bash
# Get account balances (requires API credentials)
curl http://localhost:3000/balances

# Place an order (requires API credentials)
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "side": "buy",
    "order_type": "limit_order",
    "market": "BTCINR",
    "price_per_unit": "5000000",
    "total_quantity": "0.001",
    "timestamp": 1640995200000
  }'

# Cancel an order
curl -X DELETE http://localhost:3000/orders/ORDER_ID

# Get order status
curl http://localhost:3000/orders/ORDER_ID
```

### 4. Arbitrage Engine Endpoints

```bash
# Execute arbitrage bundle (from engine)
curl -X POST http://localhost:3000/bundles \
  -H "Content-Type: application/json" \
  -d '{
    "triangle_id": "BTC-ETH-INR",
    "route": "BTC->ETH->INR->BTC",
    "legs": [
      {"from": "BTC", "to": "ETH", "market": "ETHBTC"},
      {"from": "ETH", "to": "INR", "market": "ETHINR"},
      {"from": "INR", "to": "BTC", "market": "BTCINR"}
    ],
    "expected_edge": 0.0015,
    "capital_inr": 10000,
    "risk_token": "arb_12345"
  }'

# Get broker metrics
curl http://localhost:3000/metrics/broker
```

## 🔧 Manual Testing Steps

### Step 1: Verify System Health
```bash
# Run the automated test
./test-system.sh

# Or test manually
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
```

### Step 2: Test Market Data Flow
```bash
# Check if market data is flowing
curl http://localhost:3000/markets/states

# You should see market data with current prices
```

### Step 3: Test Engine Communication
```bash
# Check if engine is processing data
curl http://localhost:3000/metrics | grep arbitrage

# Look for arbitrage-related metrics
```

### Step 4: Test Order Execution (Paper Trading)
```bash
# First, set up API credentials in .env file
# Then test with small amounts
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "side": "buy",
    "order_type": "limit_order", 
    "market": "BTCINR",
    "price_per_unit": "5000000",
    "total_quantity": "0.0001"
  }'
```

## 🐛 Troubleshooting

### Common Issues

1. **Gateway not responding**
   ```bash
   # Check if gateway is running
   ps aux | grep "ts-node-dev.*gateway"
   
   # Restart gateway
   cd apps/gateway-node && npm run dev
   ```

2. **Engine not running**
   ```bash
   # Check if engine is running
   ps aux | grep arbitrage-engine
   
   # Restart engine
   cd apps/engine-rust && cargo run
   ```

3. **ClickHouse not accessible**
   ```bash
   # Check ClickHouse status
   curl http://localhost:8124/ping
   
   # Start ClickHouse if needed
   cd infra/docker && docker-compose up -d clickhouse
   ```

4. **UDS socket not found**
   ```bash
   # Check if socket exists
   ls -la /tmp/arb_engine.sock
   
   # Restart engine to recreate socket
   ```

## 📊 Monitoring

### Real-time Monitoring
```bash
# Watch system logs
tail -f logs/gateway.log
tail -f logs/engine.log

# Monitor metrics
watch -n 1 'curl -s http://localhost:3000/metrics | head -20'
```

### Performance Testing
```bash
# Test market data processing speed
time curl http://localhost:3000/markets/states

# Test order placement speed
time curl -X POST http://localhost:3000/orders ...
```

## 🎯 Expected Results

### Successful System Should Show:
1. ✅ All health checks passing
2. ✅ Market data flowing in real-time
3. ✅ Engine detecting arbitrage opportunities
4. ✅ Orders executing successfully
5. ✅ Metrics showing activity

### Performance Benchmarks:
- Market data latency: < 10ms
- Order placement: < 50ms
- Arbitrage detection: < 5ms
- UDS communication: < 1ms

## 🚨 Safety Notes

1. **Start with Paper Trading**: Always test with small amounts first
2. **Monitor Closely**: Watch for unexpected behavior
3. **Set Limits**: Use proper risk management
4. **Backup Data**: Ensure ClickHouse data is backed up
5. **API Keys**: Keep credentials secure

## 📈 Next Steps

1. **Set up API credentials** in `.env` file
2. **Configure risk limits** in engine config
3. **Test with small amounts** first
4. **Monitor performance** metrics
5. **Scale up gradually** as confidence grows

---

**System is ready for testing! 🚀**

