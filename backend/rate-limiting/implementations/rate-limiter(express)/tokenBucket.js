/**
 * TOKEN BUCKET RATE LIMITER
 * ==========================
 *
 * USAGE EXAMPLE:
 * --------------
 *   const tokenBucketLimiter = require('./tokenBucket');
 *
 *   // Each IP gets a bucket of 10 tokens, refilling at 1 token/second
 *   app.get('/token', tokenBucketLimiter({ maxTokens: 10, refillRate: 1, refillIntervalMs: 1000 }), (req, res) => {
 *     res.json({ message: 'Success' });
 *   });
 *
 * HOW IT WORKS (explain in interview):
 * -------------------------------------
 *   - Imagine a bucket that holds up to N tokens
 *   - Every request CONSUMES 1 token (or more for "heavier" operations)
 *   - Tokens REFILL at a constant rate (e.g., 1 token per second)
 *   - If the bucket is empty → request is rejected (429)
 *   - If the bucket is full and you don't use it → tokens accumulate (burst capacity)
 *
 *   Key insight: We don't use a background timer/interval.
 *   Instead, we calculate how many tokens should have refilled
 *   since the last request using elapsed time. This is called
 *   "lazy refill" or "virtual scheduling" — much more efficient.
 *
 * INTERVIEW TALKING POINTS:
 * --------------------------
 *   ✅ Allows controlled bursting (unused tokens accumulate)
 *   ✅ Smooth average rate enforcement
 *   ✅ Used by AWS, Stripe, and most API gateways
 *   ❌ Two params to tune (capacity + refill rate) — easy to misconfigure
 *   ❌ Burst may still overload downstream services momentarily
 *   💡 Compare with Leaky Bucket: Token Bucket allows bursts,
 *      Leaky Bucket enforces a strictly constant output rate
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS       = 10;   // bucket capacity (also initial token count)
const DEFAULT_REFILL_RATE      = 1;    // tokens added per refill interval
const DEFAULT_REFILL_INTERVAL  = 1000; // refill every 1000ms (1 second)

// ─── STORE ───────────────────────────────────────────────────────────────────

/**
 * store shape per IP key:
 * {
 *   tokens:       number,  // current token count (can be fractional during math)
 *   lastRefillAt: number   // timestamp (ms) of the last time we calculated refill
 * }
 *
 * NOTE: In production, use Redis + Lua scripts for atomic read-modify-write.
 *       A non-atomic check-then-update is a race condition under high concurrency.
 */
const store = new Map();

// ─── MIDDLEWARE FACTORY ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware function configured with the given options.
 *
 * @param {Object} options
 * @param {number} options.maxTokens        - Bucket capacity and starting tokens (default 10)
 * @param {number} options.refillRate       - Tokens added per interval (default 1)
 * @param {number} options.refillIntervalMs - How often tokens refill in ms (default 1000)
 */
function tokenBucketLimiter(options = {}) {
  const maxTokens      = options.maxTokens       || DEFAULT_MAX_TOKENS;
  const refillRate     = options.refillRate      || DEFAULT_REFILL_RATE;
  const refillInterval = options.refillIntervalMs || DEFAULT_REFILL_INTERVAL;

  return function (req, res, next) {
    // Step 1: Identify the client
    const ip  = req.ip;
    const now = Date.now();

    // Step 2: Get or create bucket for this IP
    // New IPs start with a FULL bucket (maxTokens) — they get a fresh allowance
    if (!store.has(ip)) {
      store.set(ip, {
        tokens:       maxTokens, // start full
        lastRefillAt: now
      });
    }
    const bucket = store.get(ip);

    // Step 3: LAZY REFILL — calculate tokens earned since the last request
    // We never run a background timer. Instead, on every request we ask:
    // "How much time has passed? How many tokens should have been added?"
    const elapsedMs        = now - bucket.lastRefillAt;  // time since last refill
    const intervalsElapsed = elapsedMs / refillInterval; // e.g., 2500ms / 1000ms = 2.5 intervals
    const tokensToAdd      = intervalsElapsed * refillRate; // e.g., 2.5 * 1 = 2.5 tokens

    if (tokensToAdd > 0) {
      // Add tokens but never exceed the bucket's maximum capacity
      bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
      // Update the last refill timestamp to now
      bucket.lastRefillAt = now;
    }

    // Step 4: Check if there's at least 1 token available to spend
    if (bucket.tokens < 1) {
      // Calculate when the next token will be available
      const tokensNeeded    = 1 - bucket.tokens;          // fractional tokens still needed
      const msUntilToken    = (tokensNeeded / refillRate) * refillInterval;
      const retryAfterSec   = Math.ceil(msUntilToken / 1000);

      res.setHeader('Retry-After', retryAfterSec);

      return res.status(429).json({
        error:          'Too Many Requests',
        algorithm:      'Token Bucket',
        maxTokens:      maxTokens,
        currentTokens:  parseFloat(bucket.tokens.toFixed(2)),
        refillRate:     `${refillRate} token(s) per ${refillInterval}ms`,
        retryAfter:     `${retryAfterSec}s`,
        message:        `Bucket empty. Next token available in ~${retryAfterSec}s.`
      });
    }

    // Step 5: Consume 1 token and allow the request
    bucket.tokens -= 1;

    // Attach token info to the response headers (good practice — clients can read this)
    res.setHeader('X-RateLimit-Limit',     maxTokens);
    res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens));

    return next();
  };
}

module.exports = tokenBucketLimiter;