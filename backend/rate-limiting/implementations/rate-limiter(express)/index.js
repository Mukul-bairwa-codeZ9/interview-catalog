/**
 * RATE LIMITER DEMO SERVER
 * =========================
 *
 * Wires all 4 rate limiting algorithms to separate routes
 * so you can test and compare them side by side.
 *
 * SETUP:
 * -------
 *   npm init -y
 *   npm install express
 *   node index.js
 *
 * TEST WITH CURL (run multiple times fast to trigger 429):
 * --------------------------------------------------------
 *   curl http://localhost:3000/                  # health check
 *   curl http://localhost:3000/fixed             # Fixed Window
 *   curl http://localhost:3000/sliding           # Sliding Window
 *   curl http://localhost:3000/token             # Token Bucket
 *   curl http://localhost:3000/leaky             # Leaky Bucket
 *
 * STRESS TEST (hit a route 15 times instantly):
 * ----------------------------------------------
 *   for i in $(seq 1 15); do curl -s http://localhost:3000/fixed; echo; done
 *
 * ROUTES SUMMARY:
 * ----------------
 *   GET /             → health check (no rate limiting)
 *   GET /fixed        → Fixed Window   (10 req / 60s window)
 *   GET /sliding      → Sliding Window (10 req / rolling 60s)
 *   GET /token        → Token Bucket   (10 tokens, +1 token/sec)
 *   GET /leaky        → Leaky Bucket   (queue cap 10, drains 1/sec)
 */

const express = require('express');

// ─── IMPORT RATE LIMITER MIDDLEWARES ─────────────────────────────────────────

const fixedWindowLimiter   = require('./fixedWindow');
const slidingWindowLimiter = require('./slidingWindow');
const tokenBucketLimiter   = require('./tokenBucket');
const leakyBucketLimiter   = require('./leakyBucket');

// ─── APP SETUP ────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON request bodies
app.use(express.json());

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status:  'ok',
    message: 'Rate Limiter Demo Server is running',
    routes: {
      '/fixed':   'Fixed Window   — 10 req per 60s window',
      '/sliding': 'Sliding Window — 10 req per rolling 60s',
      '/token':   'Token Bucket   — 10 tokens, refills 1/sec',
      '/leaky':   'Leaky Bucket   — queue cap 10, drains 1/sec'
    }
  });
});

// ─── ROUTE: FIXED WINDOW ─────────────────────────────────────────────────────
//
// Best for: simple APIs where a little boundary burst is acceptable
// Config:   10 requests allowed per 60-second fixed window per IP
//
app.get(
  '/fixed',
  fixedWindowLimiter({ windowMs: 60 * 1000, maxRequests: 10 }),
  (req, res) => {
    res.json({
      algorithm: 'Fixed Window',
      message:   'Request allowed ✅',
      info:      'Counter resets every 60 seconds. Boundary burst possible.'
    });
  }
);

// ─── ROUTE: SLIDING WINDOW ───────────────────────────────────────────────────
//
// Best for: APIs requiring precise, burst-proof rate enforcement
// Config:   10 requests in any rolling 60-second window per IP
//
app.get(
  '/sliding',
  slidingWindowLimiter({ windowMs: 60 * 1000, maxRequests: 10 }),
  (req, res) => {
    res.json({
      algorithm: 'Sliding Window',
      message:   'Request allowed ✅',
      info:      'Window slides with every request. No boundary burst.'
    });
  }
);

// ─── ROUTE: TOKEN BUCKET ─────────────────────────────────────────────────────
//
// Best for: APIs that need to allow short bursts (e.g., batch uploads, search)
// Config:   Bucket holds 10 tokens; 1 token refills every second
//
app.get(
  '/token',
  tokenBucketLimiter({ maxTokens: 10, refillRate: 1, refillIntervalMs: 1000 }),
  (req, res) => {
    res.json({
      algorithm: 'Token Bucket',
      message:   'Request allowed ✅',
      info:      'Bursting allowed up to 10 req. Refills 1 token/sec.',
      headers:   'Check X-RateLimit-Limit and X-RateLimit-Remaining headers.'
    });
  }
);

// ─── ROUTE: LEAKY BUCKET ─────────────────────────────────────────────────────
//
// Best for: protecting downstream services that can't handle any bursts
// Config:   Virtual queue of max 10; drains 1 request per second
//
app.get(
  '/leaky',
  leakyBucketLimiter({ capacity: 10, leakRateMs: 1000 }),
  (req, res) => {
    res.json({
      algorithm: 'Leaky Bucket',
      message:   'Request allowed ✅',
      info:      'Strictly constant output rate. No bursting.',
      headers:   'Check X-RateLimit-Queue and X-RateLimit-Remaining headers.'
    });
  }
);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found. Check GET / for available routes.' });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────

// Express calls this when next(err) is used or an error is thrown
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Rate Limiter Demo running at http://localhost:${PORT}`);
  console.log(`\nRoutes:`);
  console.log(`  GET /         → health check`);
  console.log(`  GET /fixed    → Fixed Window   (10 req/60s)`);
  console.log(`  GET /sliding  → Sliding Window (10 req/60s rolling)`);
  console.log(`  GET /token    → Token Bucket   (10 tokens, +1/sec)`);
  console.log(`  GET /leaky    → Leaky Bucket   (cap 10, drains 1/sec)`);
  console.log(`\nStress test: for i in $(seq 1 15); do curl -s http://localhost:${PORT}/fixed; echo; done\n`);
});

module.exports = app; // export for testing