# Tradewin — High-Frequency Triangular Arbitrage Bot

A production-grade, ultra-low-latency triangular arbitrage system for INR/USDT 
markets. Built with a hybrid Node.js + Rust architecture connected via Unix Domain 
Sockets for sub-millisecond IPC.

⚡ **≤4ms decision latency** · 🦀 **Rust execution engine** · 📊 **ClickHouse analytics** · 
🐳 **Docker + Terraform AWS deployment**

---

## 🏗️ Architecture
```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│   CoinDCX    │     │  Gateway (Node.js)  │     │  Engine (Rust)   │
│  Exchange    │◄───►│                    │◄───►│                  │
│              │     │  • Socket.IO feed  │     │  • Triangle eval │
│  WebSocket + │     │  • Order routing   │     │  • UDS server    │
│  REST API    │     │  • UDS client      │     │  • Decision logic│
└──────────────┘     └────────────────────┘     └──────────────────┘
                               │
                               ▼
                      ┌─────────────────┐     ┌──────────────────┐
                      │   ClickHouse    │     │    Grafana +     │
                      │                 │     │   Prometheus     │
                      │  • Ticks / P&L  │     │  • Latency dash  │
                      │  • Order logs   │     │  • Alerts        │
                      └─────────────────┘     └──────────────────┘
```

**Key design decision:** The hot path (market data → decision → order) runs through 
a Rust engine communicating with the Node.js gateway over Unix Domain Sockets (UDS) 
— avoiding TCP overhead entirely for sub-millisecond IPC latency.

---

## ✨ What It Does

- **Triangular arbitrage detection** across ~300 INR/USDT trading pairs on CoinDCX
- **≤4ms decision time**, ≤80ms order acknowledgment target
- **Rust execution engine** evaluates triangle opportunities with configurable entry 
  thresholds, fee modeling, and per-leg slippage caps
- **Node.js gateway** handles WebSocket market data ingestion and REST order management
- **ClickHouse** stores every tick, order, and P&L event for analytics and backtesting
- **Backtester** replays historical tick data to validate strategies offline
- **Full observability** via Prometheus metrics + Grafana dashboards

---

## 📁 Project Structure
```
arbitrage-bot/
├── apps/
│   ├── gateway-node/     # Socket.IO market data + order routing (TypeScript)
│   ├── engine-rust/      # Ultra-low-latency triangle engine (Rust)
│   └── backtester/       # Offline backtesting + report generation
├── packages/
│   ├── schemas/          # Protobuf/JSON schemas shared across apps
│   ├── clients/          # Exchange REST/WebSocket clients
│   └── utils/            # Fee math, rounding, precision helpers
├── infra/
│   ├── docker/           # Dockerfiles + docker-compose
│   ├── k8s/              # Helm charts / Kubernetes manifests
│   └── terraform/        # AWS VPC, EC2, Security Groups (ap-south-1)
├── observability/
│   ├── grafana/          # Dashboard JSON definitions
│   └── alerts/           # Prometheus alert rules
└── docs/                 # Architecture + integration specs
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Execution Engine | **Rust** (ultra-low-latency, zero-GC) |
| Gateway | **Node.js + TypeScript** |
| IPC | **Unix Domain Sockets** (UDS) with binary length-prefix framing |
| Market Data | **CoinDCX Socket.IO** WebSocket feed |
| Analytics | **ClickHouse** (ticks, orders, P&L) |
| Observability | **Prometheus + Grafana** |
| Infrastructure | **Docker + Terraform + AWS EC2** (ap-south-1) |
| Secrets | **AWS KMS / Secrets Manager** |

---

## 🔒 Risk Management

- **Circuit breakers** — auto-disable symbols on high reject rate (>5%), slippage (>15 bps p95), or latency spikes (>10ms p99)
- **Position limits** — ₹10,000 per triangle, ₹30,000 per symbol
- **Slippage caps** — configurable per leg (leg1: 8 bps, leg2: 10 bps, leg3: 8 bps)
- **Toxic fill handling** — immediate market-out on partial fills
- **Connection guards** — private stream staleness detection with automatic disable

---

## 📊 Performance Targets

| Metric | Target |
|---|---|
| Decision Latency | ≤ 4ms |
| Order ACK Time | ≤ 80ms p99 |
| Fill Hit Rate | ≥ 65% |
| Sharpe Ratio | ≥ 1.0 |

---

## 🚀 Quick Start
```bash
# Clone and configure
cp apps/gateway-node/env.example apps/gateway-node/.env
# Add your CoinDCX API credentials to .env

# Start all services
cd infra/docker
docker-compose up -d

# Verify
curl http://localhost:3000/healthz
open http://localhost:3001  # Grafana (admin/admin)
```

See [LOCAL_SETUP.md](./LOCAL_SETUP.md) for full development setup and 
[COINDCX_INTEGRATION.md](./COINDCX_INTEGRATION.md) for exchange configuration.

---

## 🧪 Testing
```bash
# Unit tests
cd apps/gateway-node && npm test
cd apps/engine-rust && cargo test

# Integration tests
docker-compose -f docker-compose.test.yml up -d
npm run test:integration

# Backtest on historical data
cd apps/backtester
npm run backtest -- --input data/historical_ticks.csv --output results/
```

---

## ⚠️ Disclaimer

This software is for educational and research purposes. Cryptocurrency trading 
involves substantial financial risk. Use at your own discretion.
