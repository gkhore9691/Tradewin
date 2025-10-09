#!/bin/bash

echo "🚀 Testing Arbitrage System"
echo "=========================="

# Test 1: Check if Rust engine is running
echo "1. Checking Rust Engine..."
if ps aux | grep "arbitrage-engine" | grep -v grep > /dev/null; then
    echo "   ✅ Rust engine is running"
else
    echo "   ❌ Rust engine is not running"
    exit 1
fi

# Test 2: Check if UDS socket exists
echo "2. Checking UDS Socket..."
if [ -S "/tmp/arb_engine.sock" ]; then
    echo "   ✅ UDS socket exists"
else
    echo "   ❌ UDS socket not found"
    exit 1
fi

# Test 3: Check if ClickHouse is running
echo "3. Checking ClickHouse..."
if curl -s http://localhost:8124/ping | grep -q "Ok"; then
    echo "   ✅ ClickHouse is running"
else
    echo "   ❌ ClickHouse is not accessible"
    exit 1
fi

# Test 4: Check if Gateway is responding
echo "4. Checking Gateway Health..."
if curl -s http://localhost:3000/healthz | grep -q "ok"; then
    echo "   ✅ Gateway health endpoint is working"
else
    echo "   ❌ Gateway health endpoint failed"
    exit 1
fi

# Test 5: Test basic endpoints
echo "5. Testing Basic Endpoints..."

# Test metrics endpoint
echo "   Testing metrics endpoint..."
if curl -s http://localhost:3000/metrics | head -1 | grep -q "arbitrage"; then
    echo "   ✅ Metrics endpoint working"
else
    echo "   ⚠️  Metrics endpoint not fully working (this is expected without full setup)"
fi

# Test market states endpoint
echo "   Testing market states endpoint..."
if curl -s http://localhost:3000/markets/states | grep -q "\[\]"; then
    echo "   ✅ Market states endpoint working (empty as expected)"
else
    echo "   ⚠️  Market states endpoint not working (expected without market data)"
fi

echo ""
echo "🎉 Basic System Test Complete!"
echo ""
echo "Next steps for full testing:"
echo "1. Set up CoinDCX API credentials in .env file"
echo "2. Test market data streaming"
echo "3. Test arbitrage opportunity detection"
echo "4. Test order execution (with paper trading first)"