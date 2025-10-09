#!/bin/bash

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git
yum install -y git

# Create application directory
mkdir -p /opt/arbitrage-bot
cd /opt/arbitrage-bot

# Clone repository (you would need to set up proper access)
# git clone https://github.com/your-repo/arbitrage-bot.git .

# For now, create a simple docker-compose file
cat > docker-compose.yml << 'EOF'
${docker_compose_file}
EOF

# Create environment files
cat > .env.gateway << 'EOF'
# Exchange Configuration
EXCHANGE_REST_BASE=https://api.coindcx.com
EXCHANGE_WS_PUBLIC=wss://stream.coindcx.com
EXCHANGE_WS_PRIVATE=wss://stream.coindcx.com
EXCHANGE_API_KEY=${EXCHANGE_API_KEY}
EXCHANGE_API_SECRET=${EXCHANGE_API_SECRET}

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
CH_DSN=http://clickhouse:8123
CH_DB=arb

# Server Configuration
PORT=3000
HOST=0.0.0.0

# UDS Configuration
UDS_ENGINE_PATH=/tmp/arb_engine.sock

# Logging
LOG_LEVEL=info
NODE_ENV=production
EOF

# Create config for engine
cat > config.toml << 'EOF'
entry_threshold_bps = 8
cooldown_ms = 250
fee_taker_bps = 20
min_fill_fraction_l1 = 0.85
min_fill_fraction_l2 = 0.90
triangle_cap_inr = 10000
symbol_cap_inr = 30000
book_max_age_ms = 1500
bid_ask_levels = 20
aggressive_eps_bps = 2
reject_rate_limit_bps = 500
slippage_limit_bps = 15
quiet_period_ms = 60000

uds_path = "/tmp/arb_engine.sock"

[slip_cap_bps]
leg1 = 8
leg2 = 10
leg3 = 8

symbols = ["BTC", "ETH", "BNB", "ADA", "SOL", "DOT", "MATIC", "AVAX", "LINK", "UNI"]
EOF

# Start services
docker-compose up -d

# Create systemd service for auto-start
cat > /etc/systemd/system/arbitrage-bot.service << 'EOF'
[Unit]
Description=Arbitrage Trading Bot
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/arbitrage-bot
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl enable arbitrage-bot.service

# Install monitoring tools
yum install -y htop iotop nethogs

# Set up log rotation
cat > /etc/logrotate.d/arbitrage-bot << 'EOF'
/var/log/arbitrage-bot/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /opt/arbitrage-bot/docker-compose.yml restart gateway engine
    endscript
}
EOF

# Create log directory
mkdir -p /var/log/arbitrage-bot

echo "Arbitrage bot setup completed successfully!"

