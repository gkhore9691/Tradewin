class ArbitrageDashboard {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.currentMarket = 'BTCINR';
        this.orderbookData = { bids: [], asks: [] };
        this.markets = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;
        this.reconnectTimer = null;
        this.triangleStates = new Map(); // Track latest state of each triangle
        this.opportunities = [];
        this.maxOpportunities = 10; // Only show top 10
        this.currentFilter = 'all';
        this.tickCount = 0;
        this.lastTickTime = Date.now();
        
        this.initializeElements();
        this.bindEvents();
        this.loadMarkets();
        this.connect();
        this.startTickRateCalc();
    }

    initializeElements() {
        // Top bar elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.oppCount = document.getElementById('oppCount');
        this.profitableCount = document.getElementById('profitableCount');
        this.bestEdgeDisplay = document.getElementById('bestEdge');
        this.totalMarkets = document.getElementById('totalMarkets');
        
        // Triangle grid
        this.triangleGrid = document.getElementById('triangleGrid');
        this.triangleSearch = document.getElementById('triangleSearch');
        
        // Opportunities
        this.topOpportunities = document.getElementById('topOpportunities');
        
        // Orderbook
        this.currentMarketDisplay = document.getElementById('currentMarket');
        this.marketSelect = document.getElementById('marketSelect');
        this.bidsList = document.getElementById('bidsList');
        this.asksList = document.getElementById('asksList');
        this.spreadValue = document.getElementById('spreadValue');
        
        // Status bar
        this.lastUpdate = document.getElementById('lastUpdate');
        this.dataPoints = document.getElementById('dataPoints');
        this.tickRate = document.getElementById('tickRate');
    }

    bindEvents() {
        this.marketSelect.addEventListener('change', (e) => this.selectMarket(e.target.value));
        this.triangleSearch.addEventListener('input', (e) => this.filterTriangles(e.target.value));
        
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.renderTopOpportunities();
            });
        });
    }

    async loadMarkets() {
        try {
            const response = await fetch('http://localhost:3000/markets');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            this.markets = await response.json();
            this.populateMarketSelect();
            this.totalMarkets.textContent = this.markets.length;
        } catch (error) {
            console.error('Error loading markets:', error);
        }
    }

    populateMarketSelect() {
        this.marketSelect.innerHTML = '';
        this.markets.sort().forEach(market => {
            const option = document.createElement('option');
            option.value = market;
            option.textContent = market;
            if (market === this.currentMarket) option.selected = true;
            this.marketSelect.appendChild(option);
        });
    }

    selectMarket(market) {
        if (!market) return;
        this.currentMarket = market;
        this.currentMarketDisplay.innerHTML = `<i class="fas fa-book"></i> Market: ${market}`;
        if (this.isConnected) {
            this.subscribeToMarket(market);
        }
    }

    connect() {
        if (this.isConnected) return;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        try {
            this.connectionStatus.querySelector('.status-text').textContent = 'Connecting...';
            this.connectionStatus.className = 'status-indicator';
            
            this.ws = new WebSocket('ws://localhost:3000');
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateConnectionStatus(true);
                if (this.currentMarket) {
                    this.subscribeToMarket(this.currentMarket);
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = (event) => {
                this.isConnected = false;
                this.updateConnectionStatus(false);
                if (event.code !== 1000) {
                    this.attemptReconnect();
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

        } catch (error) {
            console.error('Error connecting:', error);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.connectionStatus.querySelector('.status-text').textContent = 'Failed';
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        
        this.connectionStatus.querySelector('.status-text').textContent = `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`;
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.connectionStatus.className = 'status-indicator connected';
            this.connectionStatus.querySelector('.status-text').textContent = 'Connected';
        } else {
            this.connectionStatus.className = 'status-indicator disconnected';
            this.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
        }
    }

    subscribeToMarket(market) {
        if (!this.isConnected || !this.ws) return;
        const message = {
            type: 'subscribe',
            market: market,
            data: 'orderbook'
        };
        this.ws.send(JSON.stringify(message));
    }

    handleMessage(data) {
        this.tickCount++;
        
        switch (data.type) {
            case 'orderbook':
                this.updateOrderbook(data.data);
                break;
            case 'opportunity':
                this.handleOpportunity(data.data);
                break;
            default:
                break;
        }
    }

    handleOpportunity(data) {
        const edge = parseFloat(data.edge);
        const capitalInr = parseFloat(data.capitalInr);
        
        // Debug logging
        console.log('Opportunity data:', {
            edge: data.edge,
            capitalInr: data.capitalInr,
            parsedEdge: edge,
            parsedCapitalInr: capitalInr
        });
        
        const opp = {
            ...data,
            edge: edge,
            capitalInr: capitalInr,
            id: Date.now() + Math.random(),
            receivedAt: new Date()
        };
        
        // Update triangle state
        this.triangleStates.set(data.triangleId, opp);
        
        // Add to opportunities list
        this.opportunities.unshift(opp);
        if (this.opportunities.length > 100) {
            this.opportunities = this.opportunities.slice(0, 100);
        }
        
        // Update UI
        this.renderTriangleGrid();
        this.renderTopOpportunities();
        this.updateStats();
    }

    renderTriangleGrid() {
        this.triangleGrid.innerHTML = '';
        
        const triangles = Array.from(this.triangleStates.values()).sort((a, b) => b.edge - a.edge);
        
        triangles.forEach(tri => {
            const tile = document.createElement('div');
            const edge = parseFloat(tri.edge);
            const isProfitable = edge >= 8;
            const isNearMiss = edge >= -10 && edge < 8;
            
            tile.className = `triangle-tile ${isProfitable ? 'profitable' : isNearMiss ? 'near-miss' : ''}`;
            tile.innerHTML = `
                <div class="triangle-header">
                    <span class="triangle-name">${tri.triangleId}</span>
                    <span class="triangle-edge ${edge >= 0 ? 'positive' : 'negative'}">${edge.toFixed(4)} bps</span>
                </div>
                <div class="triangle-route">${tri.route}</div>
            `;
            
            tile.addEventListener('click', () => {
                // Could expand to show details or highlight in opportunities
                this.highlightOpportunity(tri.triangleId);
            });
            
            this.triangleGrid.appendChild(tile);
        });
    }

    renderTopOpportunities() {
        this.topOpportunities.innerHTML = '';
        
        let filtered = this.opportunities;
        
        if (this.currentFilter === 'profitable') {
            filtered = this.opportunities.filter(o => parseFloat(o.edge) >= 8);
        } else if (this.currentFilter === 'near') {
            filtered = this.opportunities.filter(o => {
                const e = parseFloat(o.edge);
                return e >= -10 && e < 8;
            });
        }
        
        const topN = filtered.slice(0, this.maxOpportunities);
        
        if (topN.length === 0) {
            this.topOpportunities.innerHTML = `
                <div class="no-data-compact">
                    <i class="fas fa-clock"></i>
                    <p>No ${this.currentFilter} opportunities yet</p>
                </div>
            `;
            return;
        }
        
        topN.forEach((opp, index) => {
            const card = this.createCompactOppCard(opp, index === 0);
            this.topOpportunities.appendChild(card);
        });
    }

    createCompactOppCard(opp, isLatest) {
        const card = document.createElement('div');
        const edge = parseFloat(opp.edge) || 0;
        const capitalInr = parseFloat(opp.capitalInr) || 0;
        const isProfitable = edge >= 8;
        const isNearMiss = edge >= -10 && edge < 8;
        
        card.className = `opp-card-compact ${isLatest ? 'latest' : ''} ${isProfitable ? 'profitable' : isNearMiss ? 'near-miss' : 'unprofitable'}`;
        
        const profit = parseFloat((capitalInr * edge / 10000).toFixed(4));
        const timeAgo = this.getTimeAgo(opp.receivedAt);
        
        card.innerHTML = `
            <div class="opp-card-header">
                <div class="opp-card-title">
                    ${opp.triangleId}
                    <span class="opp-route-badge">${opp.route}</span>
                </div>
                <span class="opp-time-compact">${timeAgo}</span>
            </div>
            <div class="opp-metrics">
                <div class="opp-metric">
                    <span class="opp-metric-value ${edge >= 0 ? 'positive' : 'negative'}">${edge.toFixed(4)}</span>
                    <span class="opp-metric-label">Edge (bps)</span>
                </div>
                <div class="opp-metric">
                    <span class="opp-metric-value ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? '+' : ''}₹${profit.toFixed(4)}</span>
                    <span class="opp-metric-label">Profit</span>
                </div>
                <div class="opp-metric">
                    <span class="opp-metric-value">₹${capitalInr.toFixed(2)}</span>
                    <span class="opp-metric-label">Capital</span>
                </div>
            </div>
            <div class="opp-legs-compact">
                ${opp.legs.map((leg, i) => {
                    const legPrice = parseFloat(leg.vwap_price || leg.price);
                    const legQty = parseFloat(leg.qty);
                    return `
                        <div class="leg-compact">
                            <span class="leg-num-compact">${i + 1}</span>
                            <span class="leg-side-compact ${leg.side.toLowerCase()}">${leg.side}</span>
                            <span class="leg-market-compact">${leg.market}</span>
                            <span class="leg-price-compact">@ ${legPrice.toFixed(8)}</span>
                            <span class="leg-qty-compact">${legQty.toFixed(8)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        return card;
    }

    updateOrderbook(data) {
        if (!data || !data.market) return;

        this.orderbookData = {
            bids: data.bids || [],
            asks: data.asks || []
        };

        this.renderOrderbookCompact();
        this.updateLastUpdate();
    }

    renderOrderbookCompact() {
        // Asks (top 10)
        this.asksList.innerHTML = '';
        const asks = [...this.orderbookData.asks].sort((a, b) => a.price - b.price).slice(0, 10);
        
        if (asks.length === 0) {
            this.asksList.innerHTML = '<div class="no-data-compact">No data</div>';
        } else {
            asks.reverse().forEach(ask => {
                const row = document.createElement('div');
                row.className = 'order-row-compact';
                row.innerHTML = `
                    <span>${ask.price.toFixed(8)}</span>
                    <span>${ask.amount.toFixed(8)}</span>
                `;
                this.asksList.appendChild(row);
            });
        }
        
        // Bids (top 10)
        this.bidsList.innerHTML = '';
        const bids = [...this.orderbookData.bids].sort((a, b) => b.price - a.price).slice(0, 10);
        
        if (bids.length === 0) {
            this.bidsList.innerHTML = '<div class="no-data-compact">No data</div>';
        } else {
            bids.forEach(bid => {
                const row = document.createElement('div');
                row.className = 'order-row-compact';
                row.innerHTML = `
                    <span>${bid.price.toFixed(8)}</span>
                    <span>${bid.amount.toFixed(8)}</span>
                `;
                this.bidsList.appendChild(row);
            });
        }
        
        // Update spread
        if (bids.length > 0 && asks.length > 0) {
            const bestBid = Math.max(...this.orderbookData.bids.map(b => b.price));
            const bestAsk = Math.min(...this.orderbookData.asks.map(a => a.price));
            const spread = bestAsk - bestBid;
            const spreadPct = ((spread / bestBid) * 100).toFixed(3);
            this.spreadValue.textContent = `${spreadPct}%`;
        } else {
            this.spreadValue.textContent = '--';
        }
    }

    updateStats() {
        this.oppCount.textContent = this.triangleStates.size;
        
        const profitable = Array.from(this.triangleStates.values()).filter(t => parseFloat(t.edge) >= 8).length;
        this.profitableCount.textContent = profitable;
        
        const bestEdge = Math.max(...Array.from(this.triangleStates.values()).map(t => parseFloat(t.edge)), 0);
        this.bestEdgeDisplay.textContent = bestEdge > 0 ? `${bestEdge.toFixed(4)} bps` : '--';
        
        this.dataPoints.textContent = this.orderbookData.bids.length + this.orderbookData.asks.length;
    }

    filterTriangles(searchTerm) {
        const term = searchTerm.toLowerCase();
        document.querySelectorAll('.triangle-tile').forEach(tile => {
            const name = tile.querySelector('.triangle-name').textContent.toLowerCase();
            tile.style.display = name.includes(term) ? 'block' : 'none';
        });
    }

    highlightOpportunity(triangleId) {
        document.querySelectorAll('.triangle-tile').forEach(tile => {
            tile.classList.remove('active');
        });
        const tile = Array.from(document.querySelectorAll('.triangle-tile')).find(t => 
            t.querySelector('.triangle-name').textContent === triangleId
        );
        if (tile) tile.classList.add('active');
    }

    updateLastUpdate() {
        this.lastUpdate.textContent = new Date().toLocaleTimeString();
    }

    startTickRateCalc() {
        setInterval(() => {
            const now = Date.now();
            const elapsed = (now - this.lastTickTime) / 1000;
            const rate = (this.tickCount / elapsed).toFixed(1);
            this.tickRate.textContent = rate;
            this.tickCount = 0;
            this.lastTickTime = now;
        }, 5000);
    }

    formatCompact(value) {
        if (typeof value !== 'number' || isNaN(value)) return '--';
        
        if (value >= 1000000) {
            return (value / 1000000).toFixed(2) + 'M';
        } else if (value >= 1000) {
            return (value / 1000).toFixed(2) + 'k';
        } else if (value >= 1) {
            return value.toFixed(2);
        } else {
            return value.toFixed(6);
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ArbitrageDashboard();
});
