# Arbitrage Trading Bot

A sophisticated high-frequency triangular arbitrage trading system designed for INR/USDT markets with ultra-low latency execution and comprehensive risk management.

## 🎯 Overview

This system exploits transient triangular arbitrage opportunities on a single exchange with:
- **Base currencies**: INR, USDT
- **Symbols**: ~300 common trading pairs
- **Target latency**: ≤4ms decision time, ≤80ms order acknowledgment
- **Risk controls**: Built-in circuit breakers, slippage protection, and exposure limits

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Exchange      │    │    Gateway      │    │     Engine      │
│   (CoinDCX)     │◄──►│   (Node.js)     │◄──►│     (Rust)      │
│                 │    │                 │    │                 │
│ • Socket.IO     │    │ • Market Data   │    │ • Triangle      │
│ • REST API      │    │ • Order Mgmt    │    │   Evaluation    │
│ • Auth Stream   │    │ • UDS Client    │    │ • UDS Server    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   ClickHouse    │
                       │                 │
                       │ • Ticks         │
                       │ • Orders        │
                       │ • P&L           │
                       └─────────────────┘
```

## 📁 Project Structure

```
arbitrage-bot/
├── apps/
│   ├── gateway-node/          # Socket.IO market data + order routing (Node/TS)
│   ├── engine-rust/           # Ultra-low-latency triangle engine (Rust)
│   └── backtester/            # Offline backtesting + report gen (TS or Rust)
├── packages/
│   ├── schemas/               # Protobuf/JSON schemas shared by apps
│   ├── clients/               # REST/WS clients for exchange
│   └── utils/                 # Common math, rounding, precision, fees
├── infra/
│   ├── docker/                # Dockerfiles, docker-compose
│   ├── k8s/                   # Helm charts or raw manifests
│   └── terraform/             # VPC, EC2, Security Groups (ap-south-1)
├── observability/
│   ├── grafana/               # Dashboards (JSON)
│   └── alerts/                # Alert rules (Prometheus)
├── docs/                      # Specification files (md)
└── .github/
    └── workflows/             # CI/CD (lint, build, test, release)
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for development)
- Rust 1.75+ (for engine development)
- AWS CLI (for deployment)

### Local Development

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd arbitrage-bot
   cp apps/gateway-node/env.example apps/gateway-node/.env
   ```

2. **Configure environment**:
   Edit `apps/gateway-node/.env` with your exchange API credentials:
   ```bash
   EXCHANGE_API_KEY=your_api_key_here
   EXCHANGE_API_SECRET=your_api_secret_here
   ```

3. **Start services**:
   ```bash
   cd infra/docker
   docker-compose up -d
   ```

4. **Verify deployment**:
   ```bash
   # Check health
   curl http://localhost:3000/healthz
   
   # View metrics
   curl http://localhost:3000/metrics
   
   # Access Grafana (admin/admin)
   open http://localhost:3001
   ```

### Production Deployment

1. **Deploy infrastructure**:
   ```bash
   cd infra/terraform
   terraform init
   terraform plan
   terraform apply
   ```

2. **Configure secrets**:
   ```bash
   # Set up AWS Secrets Manager or KMS
   aws secretsmanager create-secret \
     --name "arbitrage/exchange-credentials" \
     --description "Exchange API credentials" \
     --secret-string '{"api_key":"your_key","api_secret":"your_secret"}'
   ```

3. **Deploy application**:
   ```bash
   # SSH to EC2 instance and start services
   ssh -i ~/.ssh/your-key.pem ec2-user@<instance-ip>
   cd /opt/arbitrage-bot
   docker-compose up -d
   ```

## 📊 Monitoring & Observability

### Metrics

The system exposes Prometheus metrics for:

- **Latency**: Decision time, order placement time
- **Performance**: Hit rate, slippage, P&L
- **Health**: Connection status, error rates
- **Trading**: Signals emitted, triangles evaluated

### Dashboards

Access Grafana at `http://localhost:3001` (admin/admin) to view:

- **Hot Path Latency**: Real-time latency monitoring
- **P&L & Hit Rate**: Trading performance
- **Symbol Health**: Per-route performance analysis
- **Errors & Rejects**: System health monitoring

### Alerts

Critical alerts are configured for:

- High decision latency (>10ms p99)
- Low hit rate (<65%)
- High reject rate (>5%)
- Private stream disconnection
- Negative P&L accumulation

## 🔧 Configuration

### Gateway Configuration

Key parameters in `.env`:

```bash
# Trading parameters
ENTRY_THRESHOLD_BPS=8          # Minimum edge to trade
COOLDOWN_MS=250                # Cooldown between signals
FEE_TAKER_BPS=20               # Exchange fee in basis points

# Risk management
TRIANGLE_CAP_INR=10000         # Max capital per triangle
SYMBOL_CAP_INR=30000           # Max capital per symbol
SLIPPAGE_LIMIT_BPS=15          # Max acceptable slippage

# Performance tuning
BID_ASK_LEVELS=5               # Depth levels to maintain
AGGRESSIVE_EPS_BPS=2           # Price improvement offset
```

### Engine Configuration

Key parameters in `config.toml`:

```toml
entry_threshold_bps = 8
cooldown_ms = 250
fee_taker_bps = 20

[slip_cap_bps]
leg1 = 8    # Slippage cap for first leg
leg2 = 10   # Slippage cap for second leg  
leg3 = 8    # Slippage cap for third leg

symbols = ["BTC", "ETH", "BNB", "ADA", "SOL"]
```

## 🧪 Testing

### Unit Tests

```bash
# Gateway tests
cd apps/gateway-node
npm test

# Engine tests
cd apps/engine-rust
cargo test

# Utils tests
cd packages/utils
npm test
```

### Integration Tests

```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration
```

### Backtesting

```bash
# Run backtest on historical data
cd apps/backtester
npm run backtest -- --input data/historical_ticks.csv --output results/
```

## 📈 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Decision Latency | ≤4ms | TBD |
| Order ACK Time | ≤80ms p99 | TBD |
| Fill Hit Rate | ≥65% | TBD |
| Sharpe Ratio | ≥1.0 | TBD |
| Daily P&L | >0 INR | TBD |

## 🔒 Security

- API keys stored in AWS KMS/Secrets Manager
- IAM roles for EC2 instance permissions
- VPC with private subnets for internal communication
- All network traffic encrypted in transit
- Structured logging with sensitive data scrubbing

## 🚨 Risk Management

### Circuit Breakers

- **Reject Rate**: Disable symbol if >5% rejection rate
- **Slippage**: Disable if p95 slippage >15 bps
- **Latency**: Disable if decision time >10ms p99
- **Connection**: Disable if private stream stale >5s

### Position Limits

- **Per Triangle**: Maximum 10,000 INR exposure
- **Per Symbol**: Maximum 30,000 INR exposure
- **Total**: Configurable global exposure limit

### Hedging Policy

- Immediate market-out on partial fills
- Toxic fill marking for analytics
- Emergency position closure procedures

## 📚 API Reference

### Gateway Endpoints

- `GET /healthz` - Health check
- `GET /readyz` - Readiness check
- `GET /metrics` - Prometheus metrics
- `POST /bundles` - Execute order bundle
- `GET /balances` - Account balances
- `GET /markets/:market/state` - Market state

### Engine UDS Protocol

- `TopOfBook` messages from gateway
- `OrderBundle` messages to gateway
- Binary serialization with length prefix

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For issues and questions:

1. Check the [documentation](./docs/)
2. Review [monitoring dashboards](http://localhost:3001)
3. Check system logs: `docker-compose logs -f`
4. Contact the development team

---

**⚠️ Disclaimer**: This software is for educational and research purposes. Trading cryptocurrencies involves substantial risk. Use at your own risk.

