const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const tasksRouter = require('./routes/tasks');

const app = express();

// ── Track server start time for uptime ───────────────────────────────────────
const startTime = Date.now();

// ── Security: Helmet (sets safe HTTP headers) ────────────────────────────────
app.use(helmet());

// ── Security: CORS — allow only known origins ────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Always allow localhost in development / test
const devOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'];
const corsOrigins = [...new Set([...allowedOrigins, ...devOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and whitelisted origins
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: origin '${origin}' not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ── Security: Rate limiting — 100 requests per 15 minutes per IP ─────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,  // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ── Body & Cookie parsing ───────────────────────────────────────────────────
const cookieParser = require('cookie-parser');
app.use(express.json());
app.use(cookieParser());

// ── Health check (both paths: uptime-probe friendly + versioned) ─────────────
const healthHandler = (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.status(200).json({
    status: 'ok',
    uptime,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};
app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// ── Auth routes ───────────────────────────────────────────────────────────────
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

// ── API v1 routes (protected) ─────────────────────────────────────────────────
const authenticate = require('./middleware/authenticate');
app.use('/api/v1/tasks', authenticate, tasksRouter);

module.exports = app;
