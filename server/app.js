const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const tasksRouter = require('./routes/tasks');

const app = express();

// Render/Heroku sit behind a reverse proxy — needed for secure cookies & rate limits
app.set('trust proxy', 1);

// ── Track server start time for uptime ───────────────────────────────────────
const startTime = Date.now();

// ── Security: Helmet (sets safe HTTP headers) ────────────────────────────────
app.use(
  helmet({
    // API is called cross-origin from Vercel; default CORP blocks some fetches
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ── Security: CORS — allow only known origins ────────────────────────────────
// Set on Render: ALLOWED_ORIGINS=https://your-app.vercel.app
// Or set FRONTEND_URL to the same value (single origin shorthand).
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS || '').split(','),
  process.env.FRONTEND_URL || '',
]
  .map((o) => o.trim())
  .filter(Boolean);

// Always allow localhost in development / test
const devOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'];
const corsOrigins = [...new Set([...allowedOrigins, ...devOrigins])];

function isOriginAllowed(origin) {
  return !origin || corsOrigins.includes(origin);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, origin || true);
      }
      console.warn(`CORS blocked origin: ${origin}. Allowed: ${corsOrigins.join(', ') || '(none — set ALLOWED_ORIGINS on Render)'}`);
      return callback(null, false);
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

// ── Cache stats endpoint ──────────────────────────────────────────────────────
// GET /api/v1/cache-stats — returns Upstash Redis INFO metrics
// Useful for measuring hit rate without leaving the app.
const cacheModule = require('./cache');
app.get('/api/v1/cache-stats', async (req, res) => {
  try {
    const { Redis } = require('@upstash/redis');
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return res.status(200).json({ enabled: false, message: 'Redis not configured' });
    }
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    // Upstash supports INFO via a raw command
    const info = await redis.info();
    // Parse the key metrics out of the INFO string
    const lines = typeof info === 'string' ? info.split('\r\n') : [];
    const extract = (key) => {
      const line = lines.find((l) => l.startsWith(`${key}:`));
      return line ? line.split(':')[1]?.trim() : null;
    };
    const hits   = parseInt(extract('keyspace_hits'), 10)   || 0;
    const misses = parseInt(extract('keyspace_misses'), 10) || 0;
    const total  = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : null;

    res.status(200).json({
      enabled: true,
      hits,
      misses,
      total,
      hitRate: hitRate ? `${hitRate}%` : 'no data yet',
      usedMemory: extract('used_memory_human'),
      connectedClients: extract('connected_clients'),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cache stats', detail: err.message });
  }
});

// ── Health check (both paths: uptime-probe friendly + versioned) ─────────────
const healthHandler = (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const productionOrigins = allowedOrigins.length;
  res.status(200).json({
    status: 'ok',
    uptime,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      cors: productionOrigins > 0,
      jwt: Boolean(process.env.JWT_SECRET),
      database: Boolean(process.env.DATABASE_URL),
      cache: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    },
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
