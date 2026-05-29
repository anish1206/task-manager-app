const express = require('express');
const cors = require('cors');
const tasksRouter = require('./routes/tasks');

const app = express();

// Track server start time for uptime calculation
const startTime = Date.now();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000); // seconds
  res.status(200).json({
    status: 'ok',
    uptime,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/tasks', tasksRouter);

module.exports = app;
