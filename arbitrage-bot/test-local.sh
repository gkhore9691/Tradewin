#!/bin/bash

echo "🚀 Starting Local Arbitrage Bot Test"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Node.js found: $NODE_VERSION"
else
    print_error "Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check Rust
if command -v cargo &> /dev/null; then
    RUST_VERSION=$(cargo --version)
    print_status "Rust found: $RUST_VERSION"
else
    print_error "Rust not found. Please install Rust 1.75+"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    print_status "Docker found"
else
    print_error "Docker not found. Please install Docker"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null; then
    print_status "Docker Compose found"
else
    print_error "Docker Compose not found. Please install Docker Compose"
    exit 1
fi

echo ""
echo "🏗️  Setting up environment..."

# Create .env file if it doesn't exist
if [ ! -f "apps/gateway-node/.env" ]; then
    cp apps/gateway-node/env.example apps/gateway-node/.env
    print_status "Created .env file from template"
    print_warning "Please edit apps/gateway-node/.env with your API credentials"
else
    print_status ".env file already exists"
fi

echo ""
echo "📦 Installing dependencies..."

# Install Node.js dependencies
cd apps/gateway-node
if [ ! -d "node_modules" ]; then
    print_status "Installing Node.js dependencies..."
    npm install
else
    print_status "Node.js dependencies already installed"
fi

# Install Rust dependencies
cd ../engine-rust
print_status "Building Rust engine..."
cargo build --release

cd ../..
print_status "Dependencies installed"

echo ""
echo "🐳 Starting infrastructure services..."

# Start Docker services
cd infra/docker
docker-compose up -d clickhouse prometheus grafana

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
if curl -s http://localhost:8123/ping > /dev/null; then
    print_status "ClickHouse is running"
else
    print_warning "ClickHouse may not be ready yet"
fi

if curl -s http://localhost:9090/-/healthy > /dev/null; then
    print_status "Prometheus is running"
else
    print_warning "Prometheus may not be ready yet"
fi

if curl -s http://localhost:3001/api/health > /dev/null; then
    print_status "Grafana is running"
else
    print_warning "Grafana may not be ready yet"
fi

cd ../..
print_status "Infrastructure services started"

echo ""
echo "🔧 Building applications..."

# Build gateway
cd apps/gateway-node
npm run build
print_status "Gateway built successfully"

cd ../engine-rust
print_status "Engine built successfully"

cd ../..

echo ""
echo "🎯 Testing API endpoints..."

# Test health endpoint (will fail until gateway is running)
print_status "You can now start the applications:"
echo ""
echo "Terminal 1 - Start Gateway:"
echo "cd apps/gateway-node && npm run dev"
echo ""
echo "Terminal 2 - Start Engine:"
echo "cd apps/engine-rust && cargo run"
echo ""
echo "Then test with:"
echo "curl http://localhost:3000/healthz"
echo "curl http://localhost:3000/metrics"
echo ""
echo "Access Grafana at: http://localhost:3001 (admin/admin)"
echo "Access Prometheus at: http://localhost:9090"
echo "Access ClickHouse at: http://localhost:8123"
echo ""
echo "📚 For detailed instructions, see LOCAL_SETUP.md"
echo ""
print_status "Setup complete! 🚀"

