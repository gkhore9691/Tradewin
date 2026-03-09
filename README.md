# Tradewin — Crypto Arbitrage Trading Bot

Automated cryptocurrency arbitrage bot that detects and executes price
discrepancies across exchanges in real time.

⚡ Built with TypeScript · Runs 24/7 · Supports 800+ trading pairs

## 🧠 How It Works

Tradewin continuously monitors price feeds across multiple exchanges,
identifies arbitrage opportunities where the same asset is priced
differently, and executes buy/sell orders faster than manual trading allows.

## ✨ Features

- Real-time price monitoring across multiple exchanges via WebSocket feeds
- Arbitrage opportunity detection with configurable spread thresholds
- Automated order execution with slippage protection
- Support for 800+ cryptocurrency pairs
- gRPC-based communication for low-latency inter-service messaging
- Risk management — position sizing, max drawdown limits, cooldown periods
- Trade history logging and P&L tracking

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Communication | gRPC, WebSockets |
| Data | Real-time exchange APIs |
| Architecture | Distributed microservices |

## ⚠️ Disclaimer

This project is for educational and research purposes. Cryptocurrency trading
involves significant financial risk. Use at your own discretion.

## 🚀 Getting Started
```bash
npm install
npm run dev
```

## 🗺 Roadmap

- [x] Multi-exchange price monitoring
- [x] Arbitrage detection engine
- [x] Automated order execution
- [ ] Backtesting engine
- [ ] Web dashboard for live monitoring
- [ ] Rust rewrite for lower latency
