#!/bin/bash

echo "🚀 Starting Arbitrage Bot Dashboard"
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if gateway is running
if ! curl -s http://localhost:3000/healthz > /dev/null; then
    print_warning "Gateway is not running. Please start it first:"
    echo "  cd apps/gateway-node && npm run dev"
    echo ""
    print_info "Then run this script again to start the frontend."
    exit 1
fi

print_status "Gateway is running on port 3000"

# Start frontend server
print_info "Starting frontend server on port 8080..."
cd frontend
npm start &

# Wait a moment for the server to start
sleep 2

print_status "Frontend server started!"
echo ""
echo "🌐 Dashboard URLs:"
echo "  Frontend: http://localhost:8080"
echo "  Gateway:  http://localhost:3000"
echo ""
echo "📋 Instructions:"
echo "  1. Open http://localhost:8080 in your browser"
echo "  2. Click 'Connect' to establish WebSocket connection"
echo "  3. Select a market from the dropdown"
echo "  4. View real-time orderbook data"
echo ""
echo "🛑 To stop the frontend server, press Ctrl+C"
echo ""

# Keep the script running
wait

