require('dotenv').config();
const { Redis } = require('@upstash/redis');

// ── Client setup ──────────────────────────────────────────────────────────────
// If env vars are missing (CI, local dev without Redis) every exported function
// becomes a graceful no-op so the app still works without Redis.
let redis = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log('Redis cache: connected to Upstash');
} else {
  console.warn('Redis cache: env vars not set — caching disabled, falling through to DB');
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CACHE_TTL = parseInt(process.env.CACHE_TTL, 10) || 60; // default 60s, override via env

// ── Key builder ───────────────────────────────────────────────────────────────
/**
 * Builds a stable cache key per user + query combination.
 * Different filter/sort/page combos each get their own entry so they don't
 * collide, and invalidateUser() can wipe them all with a single SCAN pattern.
 *
 * Example keys:
 *   tasks:abc-123
 *   tasks:abc-123:c=false
 *   tasks:abc-123:s=title:o=asc:l=10
 */
function taskListKey(userId, query = {}) {
  const { completed, sort, order, limit, cursor } = query;
  const parts = [`tasks:${userId}`];
  if (completed !== undefined && completed !== '') parts.push(`c=${completed}`);
  if (sort)   parts.push(`s=${sort}`);
  if (order)  parts.push(`o=${order}`);
  if (limit)  parts.push(`l=${limit}`);
  if (cursor) parts.push(`cur=${cursor}`);
  return parts.join(':');
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Read a value from Redis.
 * Returns the parsed value on HIT, null on MISS or error.
 */
async function get(key) {
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    return value ?? null;
  } catch (err) {
    // Cache failure must never break the request — fall through to DB
    console.error('Cache GET error:', err.message);
    return null;
  }
}

/**
 * Write a value to Redis with a TTL (seconds).
 * Silent no-op if Redis is disabled or errors.
 */
async function set(key, value, ttl = CACHE_TTL) {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttl });
  } catch (err) {
    console.error('Cache SET error:', err.message);
  }
}

/**
 * Invalidate all cached task-list entries for a user.
 * Uses SCAN so it's safe on large keyspaces (no KEYS command).
 * Called after every write operation (create / update / delete).
 */
async function invalidateUser(userId) {
  if (!redis) return;
  try {
    let cursor = 0;
    let totalDeleted = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `tasks:${userId}*`,
        count: 100,
      });
      cursor = Number(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== 0);

    if (totalDeleted > 0) {
      console.log(`Cache: invalidated ${totalDeleted} key(s) for user ${userId}`);
    }
  } catch (err) {
    console.error('Cache INVALIDATE error:', err.message);
    // Don't rethrow — a cache invalidation failure is non-fatal
  }
}

module.exports = { get, set, invalidateUser, taskListKey, CACHE_TTL };
