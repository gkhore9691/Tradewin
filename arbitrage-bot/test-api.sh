#!/bin/bash

echo "🧪 Testing Arbitrage Bot API"
echo "============================"

BASE_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Test health endpoint
echo "🔍 Testing health endpoint..."
if curl -s "$BASE_URL/healthz" | grep -q "ok"; then
    print_status "Health check passed"
else
    print_error "Health check failed - is the gateway running?"
    exit 1
fi

# Test readiness endpoint
echo "🔍 Testing readiness endpoint..."
if curl -s "$BASE_URL/readyz" | grep -q "ready"; then
    print_status "Readiness check passed"
else
    print_warning "Readiness check failed - some services may not be ready"
fi

# Test metrics endpoint
echo "🔍 Testing metrics endpoint..."
if curl -s "$BASE_URL/metrics" | grep -q "decision_latency_ns"; then
    print_status "Metrics endpoint working"
else
    print_warning "Metrics endpoint may not be working properly"
fi

# Test market states endpoint
echo "🔍 Testing market states endpoint..."
MARKET_STATES=$(curl -s "$BASE_URL/markets/states")
if [ $? -eq 0 ]; then
    print_status "Market states endpoint accessible"
    echo "Market states response: $MARKET_STATES"
else
    print_warning "Market states endpoint not accessible"
fi

# Test broker metrics endpoint
echo "🔍 Testing broker metrics endpoint..."
BROKER_METRICS=$(curl -s "$BASE_URL/metrics/broker")
if [ $? -eq 0 ]; then
    print_status "Broker metrics endpoint accessible"
    echo "Broker metrics: $BROKER_METRICS"
else
    print_warning "Broker metrics endpoint not accessible"
fi

echo ""
echo "🎯 Manual Testing Commands:"
echo ""
echo "# Test order bundle (replace with valid data):"
echo "curl -X POST $BASE_URL/bundles \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"triangle_id\":\"BTC:STRAIGHT\",\"route\":\"STRAIGHT\",\"expected_edge\":0.001,\"capital_inr\":1000,\"risk_token\":\"test-123\",\"ts_engine_ns\":1640995200000000000,\"legs\":[]}'"
echo ""
echo "# Test markets (requires API key):"
echo "curl $BASE_URL/markets"
echo ""
echo "# Test market details (requires API key):"
echo "curl $BASE_URL/market-details"
echo ""
echo "# Test balances (requires API key):"
echo "curl $BASE_URL/balances"
echo ""

print_status "API testing complete! 🚀"

