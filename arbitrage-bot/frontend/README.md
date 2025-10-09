# Arbitrage Bot Frontend Dashboard

A real-time orderbook dashboard for the arbitrage trading bot, built with modern web technologies.

## Features

- 🔴 **Real-time Orderbook Display** - Live bid/ask data with color-coded visualization
- 📊 **Market Selection** - Choose from 1000+ available markets
- 📈 **Live Statistics** - Real-time spread, volume, and price information
- 🎨 **Modern UI** - Beautiful, responsive design with smooth animations
- 🔌 **WebSocket Integration** - Low-latency real-time data streaming
- 📱 **Mobile Responsive** - Works on desktop, tablet, and mobile devices

## Quick Start

### Prerequisites

1. **Arbitrage Bot Gateway** must be running on port 3000
2. **Node.js** installed on your system

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the frontend server:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

### Usage

1. **Connect to Gateway**: Click the "Connect" button to establish WebSocket connection
2. **Select Market**: Choose a market from the dropdown (e.g., BTCINR, ETHINR)
3. **View Orderbook**: Real-time bid/ask data will appear automatically
4. **Monitor Stats**: Watch live spread, volume, and price updates

## Architecture

### Frontend Components

- **HTML Structure** (`index.html`) - Semantic markup with accessibility features
- **CSS Styling** (`styles.css`) - Modern design with CSS Grid and Flexbox
- **JavaScript Logic** (`app.js`) - WebSocket client and real-time data handling

### WebSocket Protocol

The frontend communicates with the gateway using a simple JSON protocol:

#### Subscribe to Market Data
```json
{
  "type": "subscribe",
  "market": "BTCINR",
  "data": "orderbook"
}
```

#### Receive Orderbook Data
```json
{
  "type": "orderbook",
  "market": "BTCINR",
  "data": {
    "market": "BTCINR",
    "bids": [
      { "price": 50000, "amount": 0.1 },
      { "price": 49999, "amount": 0.2 }
    ],
    "asks": [
      { "price": 50001, "amount": 0.1 },
      { "price": 50002, "amount": 0.2 }
    ],
    "timestamp": "2025-09-29T19:30:00.000Z"
  }
}
```

## Customization

### Styling
- Modify `styles.css` to change colors, fonts, or layout
- CSS variables are used for easy theme customization
- Responsive breakpoints can be adjusted in the media queries

### Functionality
- Add new data types by extending the `handleMessage()` method in `app.js`
- Customize the orderbook display by modifying the `renderOrderbook()` methods
- Add new statistics by updating the `updateStats()` method

## Troubleshooting

### Connection Issues
- Ensure the arbitrage bot gateway is running on port 3000
- Check browser console for WebSocket connection errors
- Verify firewall settings allow WebSocket connections

### No Market Data
- Make sure you've selected a valid market from the dropdown
- Check that the gateway has successfully connected to CoinDCX
- Verify API credentials are properly configured

### Performance Issues
- Limit the number of orderbook levels displayed (currently set to 20)
- Reduce update frequency if experiencing lag
- Check browser developer tools for memory leaks

## Development

### Adding New Features

1. **New Data Types**: Extend the WebSocket message handling in `app.js`
2. **UI Components**: Add new sections to `index.html` and style in `styles.css`
3. **Real-time Updates**: Modify the `updateStats()` method for new metrics

### Testing

1. **Local Testing**: Use the mock data in the gateway for testing
2. **Browser Testing**: Test in Chrome, Firefox, and Safari
3. **Mobile Testing**: Verify responsive design on various screen sizes

## Security Notes

- The frontend runs on a separate port (8080) from the gateway (3000)
- WebSocket connections are not encrypted (use WSS in production)
- No sensitive data is stored in the frontend
- API credentials are handled server-side only

## Production Deployment

For production deployment:

1. **Use HTTPS/WSS**: Enable SSL certificates for secure connections
2. **CDN**: Serve static assets through a CDN for better performance
3. **Compression**: Enable gzip compression for faster loading
4. **Monitoring**: Add error tracking and performance monitoring
5. **Caching**: Implement proper caching strategies

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify the gateway logs for connection issues
3. Ensure all dependencies are properly installed
4. Test with different markets to isolate issues

---

**Built with ❤️ for the Arbitrage Bot Project**

