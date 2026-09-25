/**
 * SkillSwap Platform - Vercel Serverless Express Application Handler
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Attach user context middleware
const { attachUserContext } = require('../backend/middleware/auth');
app.use(attachUserContext);

// Mount modular API routes
const apiRoutes = require('../backend/routes');
app.use('/api', apiRoutes);

// Serve static frontend assets
const frontendPath = path.join(__dirname, '../frontend');
app.use('/css', express.static(path.join(frontendPath, 'css')));
app.use('/js', express.static(path.join(frontendPath, 'js')));
app.use('/assets', express.static(path.join(frontendPath, 'assets')));
app.use(express.static(frontendPath));

// Single Page Application Fallback
app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API route not found: ' + req.originalUrl });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

module.exports = app;
