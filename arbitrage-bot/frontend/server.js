const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname)));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Frontend server running at http://localhost:${PORT}`);
    console.log('Open your browser and navigate to the URL above to view the dashboard');
});

