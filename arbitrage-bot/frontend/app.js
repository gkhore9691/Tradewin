class ArbitrageDashboard {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.currentMarket = null;
        this.orderbookData = { bids: [], asks: [] };
        this.markets = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000; // Start with 2 seconds
        this.reconnectTimer = null;
        this.opportunities = [];
        this.maxOpportunities = 50;
        this.opportunityCount = 0;
        this.bestEdge = 0;
        
        this.initializeElements();
        this.bindEvents();
        this.loadMarkets();
        
        // Auto-connect on initialization
        this.connect();
    }

    initializeElements() {
        // Connection elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectBtn = document.getElementById('connectBtn');
        
        // Market selection
        this.marketSelect = document.getElementById('marketSelect');
        this.refreshMarkets = document.getElementById('refreshMarkets');
        this.currentMarketDisplay = document.getElementById('currentMarket');
        this.marketList = document.getElementById('marketList');
        this.marketSearch = document.getElementById('marketSearch');
        
        // Orderbook elements
        this.bidsList = document.getElementById('bidsList');
        this.asksList = document.getElementById('asksList');
        this.spreadValue = document.getElementById('spreadValue');
        
        // Stats elements
        this.lastPrice = document.getElementById('lastPrice');
        this.volume24h = document.getElementById('volume24h');
        this.spread = document.getElementById('spread');
        this.lastUpdate = document.getElementById('lastUpdate');
        this.dataPoints = document.getElementById('dataPoints');
        this.marketStatus = document.getElementById('marketStatus');
        this.totalBids = document.getElementById('totalBids');
        this.totalAsks = document.getElementById('totalAsks');
        this.bestBid = document.getElementById('bestBid');
        this.bestAsk = document.getElementById('bestAsk');
        
        // Header stats
        this.totalMarkets = document.getElementById('totalMarkets');
        this.totalVolume = document.getElementById('totalVolume');
        
        // Opportunity elements
        this.opportunityFeed = document.getElementById('opportunityFeed');
        this.oppCount = document.getElementById('oppCount');
        this.bestEdgeDisplay = document.getElementById('bestEdge');
    }

    bindEvents() {
        this.connectBtn.addEventListener('click', () => this.toggleConnection());
        this.refreshMarkets.addEventListener('click', () => this.loadMarkets());
        this.marketSelect.addEventListener('change', (e) => this.selectMarket(e.target.value));
        this.marketSearch.addEventListener('input', (e) => this.filterMarkets(e.target.value));
    }

    async loadMarkets() {
        try {
            this.refreshMarkets.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            
            const response = await fetch('http://localhost:3000/markets');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.markets = await response.json();
            this.populateMarketSelect();
            
            this.refreshMarkets.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Markets';
        } catch (error) {
            console.error('Error loading markets:', error);
            this.marketSelect.innerHTML = '<option value="">Error loading markets</option>';
            this.refreshMarkets.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Markets';
            this.showNotification('Failed to load markets. Make sure the gateway is running.', 'error');
        }
    }

    populateMarketSelect() {
        this.marketSelect.innerHTML = '<option value="">Select a market...</option>';
        
        // Sort markets alphabetically
        const sortedMarkets = this.markets.sort();
        
        sortedMarkets.forEach(market => {
            const option = document.createElement('option');
            option.value = market;
            option.textContent = market;
            this.marketSelect.appendChild(option);
        });
        
        // Populate sidebar market list
        this.populateSidebarMarkets(sortedMarkets);
        
        // Update header stats
        this.totalMarkets.textContent = sortedMarkets.length;
        
        // Auto-select BTCINR if available
        const defaultMarket = 'BTCINR';
        if (sortedMarkets.includes(defaultMarket)) {
            this.marketSelect.value = defaultMarket;
            this.selectMarket(defaultMarket);
            
            // Highlight in sidebar
            setTimeout(() => {
                const navItem = Array.from(document.querySelectorAll('.nav-item'))
                    .find(item => item.textContent === defaultMarket);
                if (navItem) {
                    navItem.classList.add('active');
                }
            }, 100);
        }
    }
    
    populateSidebarMarkets(markets) {
        this.marketList.innerHTML = '';
        this.allMarkets = markets; // Store for filtering
        
        markets.forEach(market => {
            const navItem = document.createElement('div');
            navItem.className = 'nav-item';
            navItem.textContent = market;
            navItem.dataset.market = market; // Store market name for filtering
            navItem.addEventListener('click', () => {
                // Update select dropdown
                this.marketSelect.value = market;
                this.selectMarket(market);
                
                // Update active state
                document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
                navItem.classList.add('active');
            });
            this.marketList.appendChild(navItem);
        });
    }

    filterMarkets(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const navItems = this.marketList.querySelectorAll('.nav-item');
        
        let visibleCount = 0;
        navItems.forEach(item => {
            const market = item.dataset.market.toLowerCase();
            if (market.includes(term)) {
                item.style.display = 'block';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        // Show "no results" message if needed
        const existingNoResults = this.marketList.querySelector('.no-results');
        if (existingNoResults) {
            existingNoResults.remove();
        }
        
        if (visibleCount === 0 && term !== '') {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'No markets found';
            this.marketList.appendChild(noResults);
        }
    }

    selectMarket(market) {
        if (!market) {
            this.currentMarket = null;
            this.currentMarketDisplay.textContent = 'Select a market to view orderbook';
            this.clearOrderbook();
            return;
        }

        this.currentMarket = market;
        this.currentMarketDisplay.textContent = `${market} Orderbook`;
        
        if (this.isConnected) {
            this.subscribeToMarket(market);
        }
        
        this.clearOrderbook();
    }

    toggleConnection() {
        if (this.isConnected) {
            this.disconnect();
        } else {
            this.connect();
        }
    }

    connect() {
        if (this.isConnected) return;

        // Clear any existing reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        try {
            // Update status to show connecting
            this.connectionStatus.querySelector('.status-text').textContent = 'Connecting...';
            this.connectionStatus.className = 'status-indicator';
            
            // Connect to the gateway WebSocket
            this.ws = new WebSocket('ws://localhost:3000');
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0; // Reset retry counter on successful connection
                this.reconnectDelay = 2000; // Reset delay
                this.updateConnectionStatus(true);
                this.connectBtn.innerHTML = '<i class="fas fa-unlink"></i> Disconnect';
                this.showNotification('Connected to arbitrage bot', 'success');
                
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
                this.connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect';
                
                // Only attempt reconnect if it wasn't a manual disconnect
                if (event.code !== 1000) {
                    this.attemptReconnect();
                } else {
                    this.showNotification('Disconnected from arbitrage bot', 'warning');
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Error handling is done in onclose
            };

        } catch (error) {
            console.error('Error connecting:', error);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showNotification(`Failed to connect after ${this.maxReconnectAttempts} attempts. Please check if the gateway is running and refresh the page.`, 'error');
            this.connectionStatus.querySelector('.status-text').textContent = 'Connection Failed';
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000); // Max 30 seconds
        
        this.connectionStatus.querySelector('.status-text').textContent = `Reconnecting in ${Math.round(delay / 1000)}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
        
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
        
        this.reconnectTimer = setTimeout(() => {
            console.log('Reconnecting...');
            this.connect();
        }, delay);
    }

    disconnect() {
        // Clear any pending reconnect attempts
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // Reset reconnect counter
        this.reconnectAttempts = 0;
        
        if (this.ws) {
            this.ws.close(1000, 'Manual disconnect'); // Code 1000 = normal closure
            this.ws = null;
        }
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect';
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.connectionStatus.className = 'status-indicator connected';
            this.connectionStatus.querySelector('.status-text').textContent = 'Connected';
            this.marketStatus.textContent = 'Connected';
        } else {
            this.connectionStatus.className = 'status-indicator disconnected';
            this.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
            this.marketStatus.textContent = 'Disconnected';
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
        // Handle different types of messages from the gateway
        switch (data.type) {
            case 'orderbook':
                this.updateOrderbook(data.data);
                break;
            case 'ticker':
                this.updateTicker(data.data);
                break;
            case 'trade':
                this.updateTrade(data.data);
                break;
            case 'opportunity':
                this.handleOpportunity(data.data);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    }

    handleOpportunity(data) {
        // Add to opportunities list
        this.opportunities.unshift({
            ...data,
            id: Date.now() + Math.random(),
            receivedAt: new Date()
        });
        
        // Keep only last N opportunities
        if (this.opportunities.length > this.maxOpportunities) {
            this.opportunities = this.opportunities.slice(0, this.maxOpportunities);
        }
        
        // Update stats
        this.opportunityCount++;
        if (data.edge > this.bestEdge) {
            this.bestEdge = data.edge;
        }
        
        // Update UI
        this.renderOpportunities();
        this.updateOpportunityStats();
        
        // Show notification
        this.showNotification(
            `New opportunity: ${data.triangleId} with ${data.edge.toFixed(2)} bps edge!`,
            'success'
        );
        
        // Play alert sound or visual effect
        this.flashOpportunityAlert();
    }

    renderOpportunities() {
        // Clear "no opportunities" message
        const noOpp = this.opportunityFeed.querySelector('.no-opportunities');
        if (noOpp && this.opportunities.length > 0) {
            noOpp.remove();
        }
        
        // Render opportunities
        this.opportunityFeed.innerHTML = '';
        
        if (this.opportunities.length === 0) {
            this.opportunityFeed.innerHTML = `
                <div class="no-opportunities">
                    <i class="fas fa-clock"></i>
                    <p>Waiting for arbitrage opportunities...</p>
                    <small>The engine is analyzing market data in real-time</small>
                </div>
            `;
            return;
        }
        
        this.opportunities.forEach((opp, index) => {
            const oppCard = this.createOpportunityCard(opp, index === 0);
            this.opportunityFeed.appendChild(oppCard);
        });
    }

    createOpportunityCard(opp, isLatest) {
        const card = document.createElement('div');
        const isProfitable = opp.edge >= 8; // Threshold
        const isNearMiss = opp.edge >= -10 && opp.edge < 8;
        
        card.className = `opportunity-card ${isLatest ? 'latest' : ''} ${isProfitable ? 'profitable' : isNearMiss ? 'near-miss' : 'unprofitable'}`;
        
        const profit = (opp.capitalInr * opp.edge / 10000).toFixed(2);
        const timeAgo = this.getTimeAgo(opp.receivedAt);
        const statusIcon = isProfitable ? 'fa-check-circle' : isNearMiss ? 'fa-exclamation-circle' : 'fa-times-circle';
        
        card.innerHTML = `
            <div class="opp-header">
                <div class="opp-title">
                    <i class="fas ${statusIcon}"></i>
                    <span class="triangle-name">${opp.triangleId}</span>
                    <span class="route-badge">${opp.route}</span>
                </div>
                <div class="opp-time">${timeAgo}</div>
            </div>
            <div class="opp-stats">
                <div class="opp-stat">
                    <span class="stat-label">Edge</span>
                    <span class="stat-value edge ${profit >= 0 ? 'positive' : 'negative'}">${opp.edge.toFixed(2)} bps</span>
                </div>
                <div class="opp-stat">
                    <span class="stat-label">Profit</span>
                    <span class="stat-value profit ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? '+' : ''}₹${profit}</span>
                </div>
                <div class="opp-stat">
                    <span class="stat-label">Capital</span>
                    <span class="stat-value">₹${opp.capitalInr.toLocaleString()}</span>
                </div>
            </div>
            <div class="opp-legs">
                ${opp.legs.map((leg, i) => `
                    <div class="leg-item">
                        <span class="leg-num">${i + 1}</span>
                        <span class="leg-action ${leg.side.toLowerCase()}">${leg.side}</span>
                        <span class="leg-market">${leg.market}</span>
                        <span class="leg-price">@ ${this.formatPrice(leg.vwap_price || leg.price)}</span>
                        <span class="leg-qty">Qty: ${leg.qty.toFixed(6)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        return card;
    }

    updateOpportunityStats() {
        this.oppCount.textContent = `${this.opportunityCount} opportunities`;
        this.bestEdgeDisplay.textContent = `Best: ${this.bestEdge.toFixed(2)} bps`;
    }

    flashOpportunityAlert() {
        // Add a visual flash effect to the opportunity feed card
        const feedCard = document.querySelector('.opportunity-feed-card');
        if (feedCard) {
            feedCard.classList.add('flash-alert');
            setTimeout(() => feedCard.classList.remove('flash-alert'), 1000);
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    updateOrderbook(data) {
        if (!data || !data.market || data.market !== this.currentMarket) return;

        // Track previous best prices to detect changes
        const prevBestBid = this.orderbookData.bids.length > 0 ? Math.max(...this.orderbookData.bids.map(b => b.price)) : undefined;
        const prevBestAsk = this.orderbookData.asks.length > 0 ? Math.min(...this.orderbookData.asks.map(a => a.price)) : undefined;

        this.orderbookData = {
            bids: data.bids || [],
            asks: data.asks || []
        };

        this.renderOrderbook(prevBestBid, prevBestAsk);
        this.updateStats();
        this.updateLastUpdate();
    }

    renderOrderbook(prevBestBid, prevBestAsk) {
        this.renderBids(prevBestBid);
        this.renderAsks(prevBestAsk);
        this.updateSpread();
    }

    renderBids(prevBestBid) {
        this.bidsList.innerHTML = '';
        
        if (!this.orderbookData.bids || this.orderbookData.bids.length === 0) {
            this.bidsList.innerHTML = '<div class="no-data">No bid data available</div>';
            return;
        }

        // Sort bids by price (highest first)
        const sortedBids = [...this.orderbookData.bids].sort((a, b) => b.price - a.price);
        
        const topBids = sortedBids.slice(0, 20);
        topBids.forEach((bid) => {
            const row = this.createOrderRow(bid, 'bid');
            if (prevBestBid !== undefined && bid.price === Math.max(...topBids.map(b => b.price)) && bid.price !== prevBestBid) {
                row.classList.add('changed');
                setTimeout(() => row.classList.remove('changed'), 600);
            }
            this.bidsList.appendChild(row);
        });
    }

    renderAsks(prevBestAsk) {
        this.asksList.innerHTML = '';
        
        if (!this.orderbookData.asks || this.orderbookData.asks.length === 0) {
            this.asksList.innerHTML = '<div class="no-data">No ask data available</div>';
            return;
        }

        // Sort asks by price (lowest first)
        const sortedAsks = [...this.orderbookData.asks].sort((a, b) => a.price - b.price);
        
        const topAsks = sortedAsks.slice(0, 20);
        topAsks.forEach((ask) => {
            const row = this.createOrderRow(ask, 'ask');
            if (prevBestAsk !== undefined && ask.price === Math.min(...topAsks.map(a => a.price)) && ask.price !== prevBestAsk) {
                row.classList.add('changed');
                setTimeout(() => row.classList.remove('changed'), 600);
            }
            this.asksList.appendChild(row);
        });
    }

    createOrderRow(order, type, index) {
        const row = document.createElement('div');
        row.className = `order-row ${type}-row`;
        
        const price = this.formatPrice(order.price);
        const amount = this.formatAmount(order.amount);
        const total = this.formatAmount(order.price * order.amount);
        
        row.innerHTML = `
            <span class="price">${price}</span>
            <span class="amount">${amount}</span>
            <span class="total">${total}</span>
        `;
        
        return row;
    }

    updateSpread() {
        const bestBid = this.orderbookData.bids.length > 0 ? 
            Math.max(...this.orderbookData.bids.map(b => b.price)) : 0;
        const bestAsk = this.orderbookData.asks.length > 0 ? 
            Math.min(...this.orderbookData.asks.map(a => a.price)) : 0;
        
        if (bestBid > 0 && bestAsk > 0) {
            const spreadValue = bestAsk - bestBid;
            const spreadPercent = ((spreadValue / bestBid) * 100).toFixed(2);
            
            this.spreadValue.textContent = `${this.formatPrice(spreadValue)} (${spreadPercent}%)`;
            this.spread.textContent = `Spread: ${this.formatPrice(spreadValue)} (${spreadPercent}%)`;
        } else {
            this.spreadValue.textContent = '--';
            this.spread.textContent = 'Spread: --';
        }
    }

    updateStats() {
        // Update orderbook stats
        this.totalBids.textContent = this.orderbookData.bids.length;
        this.totalAsks.textContent = this.orderbookData.asks.length;
        
        // Update best bid/ask
        if (this.orderbookData.bids.length > 0) {
            const bestBid = Math.max(...this.orderbookData.bids.map(b => b.price));
            this.bestBid.textContent = this.formatPrice(bestBid);
        } else {
            this.bestBid.textContent = '--';
        }
        
        if (this.orderbookData.asks.length > 0) {
            const bestAsk = Math.min(...this.orderbookData.asks.map(a => a.price));
            this.bestAsk.textContent = this.formatPrice(bestAsk);
        } else {
            this.bestAsk.textContent = '--';
        }
        
        // Update data points counter
        const totalDataPoints = this.orderbookData.bids.length + this.orderbookData.asks.length;
        this.dataPoints.textContent = totalDataPoints;
    }

    updateTicker(data) {
        if (data.last_price) {
            this.lastPrice.textContent = `Last Price: ${this.formatPrice(data.last_price)}`;
        }
        if (data.volume_24h) {
            this.volume24h.textContent = `24h Volume: ${this.formatAmount(data.volume_24h)}`;
        }
    }

    updateTrade(data) {
        // Handle trade updates if needed
        console.log('Trade update:', data);
    }

    updateLastUpdate() {
        const now = new Date();
        this.lastUpdate.textContent = now.toLocaleTimeString();
    }

    clearOrderbook() {
        this.orderbookData = { bids: [], asks: [] };
        this.bidsList.innerHTML = '<div class="no-data">No bid data available</div>';
        this.asksList.innerHTML = '<div class="no-data">No ask data available</div>';
        this.spreadValue.textContent = '--';
        this.spread.textContent = 'Spread: --';
        this.totalBids.textContent = '0';
        this.totalAsks.textContent = '0';
        this.bestBid.textContent = '--';
        this.bestAsk.textContent = '--';
        this.dataPoints.textContent = '0';
    }

    formatPrice(price) {
        if (typeof price !== 'number' || isNaN(price)) return '--';
        
        // Format based on price magnitude
        if (price >= 1000) {
            return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (price >= 1) {
            return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        } else {
            return price.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 });
        }
    }

    formatAmount(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) return '--';
        
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(2) + 'M';
        } else if (amount >= 1000) {
            return (amount / 1000).toFixed(2) + 'K';
        } else {
            return amount.toFixed(6);
        }
    }

    showNotification(message, type = 'info') {
        // Create a modern notification system
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Create notification content
        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">${icon}</div>
                <div class="notification-message">${message}</div>
            </div>
        `;
        
        // Style the notification with CSS variables
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px',
            borderRadius: 'var(--radius)',
            color: 'hsl(var(--foreground))',
            fontWeight: '500',
            zIndex: '10000',
            maxWidth: '320px',
            wordWrap: 'break-word',
            boxShadow: 'var(--shadow-lg)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            border: '1px solid hsl(var(--border))',
            fontSize: 'var(--font-size-sm)'
        });

        // Set background color based on type using CSS variables
        const bgColors = {
            success: 'hsl(var(--success))',
            error: 'hsl(var(--destructive))',
            warning: 'hsl(var(--warning))',
            info: 'hsl(var(--info))'
        };
        notification.style.backgroundColor = bgColors[type] || bgColors.info;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    getNotificationIcon(type) {
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };
        return icons[type] || icons.info;
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ArbitrageDashboard();
});

