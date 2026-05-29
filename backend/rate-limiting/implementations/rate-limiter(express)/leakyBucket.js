/**
 * LEAKY BUCKET RATE LIMITER
 * ==========================
 *
 * USAGE EXAMPLE:
 * --------------
 *   const leakyBucketLimiter = require('./leakyBucket');
 *
 *   // Queue up to 10 requests; process (leak) 1 request per second
 *   app.get('/leaky', leakyBucketLimiter({ capacity: 10, leakRateMs: 1000 }), (req, res) => {
 *     res.json({ message: 'Success' });
 *   });
 *
 * HOW IT WORKS (explain in interview):
 * -------------------------------------
 *   - Imagine a bucket with a small hole at the bottom
 *   - Requests pour IN from the top (any rate)
 *   - Requests drip OUT from the bottom at a CONSTANT rate (leakRateMs)
 *   - If the bucket is full → new requests OVERFLOW and are rejected (429)
 *
 *   Implementation approach (counter-based, not actual queue):
 *   We track the "queue size" virtually — how many requests are conceptually
 *   waiting — by calculating how many have "leaked out" since the last request.
 *   This avoids storing an actual queue of requests in memory.
 *
 *   Formula:
 *     leaked     = floor(elapsed / leakRateMs)
 *     queue size = max(0, previousQueue - leaked) + 1 (for current request)
 *     if queue size > capacity → reject
 *
 * INTERVIEW TALKING POINTS:
 * --------------------------
 *   ✅ Enforces a STRICTLY CONSTANT output rate — smoothest traffic shaping
 *   ✅ Protects downstream services from any burst (unlike Token Bucket)
 *   ✅ Classic networking algorithm (used in routers/switches for QoS)
 *   ❌ No burst allowance — even legitimate spikes get queued/dropped
 *   ❌ Requests may feel "slow" because they wait their turn
 *   💡 Key difference from Token Bucket:
 *      Token Bucket → controls INPUT rate, allows bursting
 *      Leaky Bucket → controls OUTPUT rate, NO bursting
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DEFAULT_CAPACITY    = 10;   // max requests that can queue up before overflow
const DEFAULT_LEAK_RATE   = 1000; // one request leaks out every 1000ms (1 per second)

// ─── STORE ───────────────────────────────────────────────────────────────────

/**
 * store shape per IP key:
 * {
 *   queue:        number,  // virtual queue size (requests waiting to be processed)
 *   lastLeakAt:   number   // timestamp (ms) when we last calculated leakage
 * }
 *
 * NOTE: This is a counter-based simulation — we don't hold actual requests in memory.
 *       In production, use Redis with atomic Lua scripts to prevent race conditions.
 */
const store = new Map();

// ─── MIDDLEWARE FACTORY ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware function configured with the given options.
 *
 * @param {Object} options
 * @param {number} options.capacity    - Max requests in the virtual queue (default 10)
 * @param {number} options.leakRateMs  - Milliseconds between each "leak" (default 1000)
 */
function leakyBucketLimiter(options = {}) {
  const capacity   = options.capacity   || DEFAULT_CAPACITY;
  const leakRateMs = options.leakRateMs || DEFAULT_LEAK_RATE;

  return function (req, res, next) {
    // Step 1: Identify the client
    const ip  = req.ip;
    const now = Date.now();

    // Step 2: Get or create the bucket for this IP
    // A new IP starts with an empty queue — nothing waiting
    if (!store.has(ip)) {
      store.set(ip, {
        queue:      0,   // no pending requests
        lastLeakAt: now  // "started" right now
      });
    }
    const bucket = store.get(ip);

    // Step 3: LEAK — calculate how many requests have drained out since last check
    const elapsedMs  = now - bucket.lastLeakAt;           // time passed since last request
    const leaked     = Math.floor(elapsedMs / leakRateMs); // whole intervals that have passed
    // e.g., 3500ms / 1000ms = 3.5 → floor = 3 requests have leaked out

    if (leaked > 0) {
      // Drain the queue by the leaked amount, but never go below 0
      bucket.queue      = Math.max(0, bucket.queue - leaked);
      // Advance lastLeakAt by exactly the leaked intervals (not to "now")
      // This preserves fractional time so we don't lose partial progress
      bucket.lastLeakAt = bucket.lastLeakAt + leaked * leakRateMs;
    }

    // Step 4: Check if the bucket (queue) has space for one more request
    if (bucket.queue >= capacity) {
      // Bucket is full — this request overflows and is rejected
      // Calculate how long until the next slot opens up
      const msUntilNextLeak = leakRateMs - (now - bucket.lastLeakAt);
      const retryAfterSec   = Math.ceil(msUntilNextLeak / 1000);

      res.setHeader('Retry-After', retryAfterSec);

      return res.status(429).json({
        error:        'Too Many Requests',
        algorithm:    'Leaky Bucket',
        capacity:     capacity,
        currentQueue: bucket.queue,
        leakRateMs:   leakRateMs,
        retryAfter:   `${retryAfterSec}s`,
        message:      `Bucket full (queue: ${bucket.queue}/${capacity}). ` +
                      `Next slot opens in ~${retryAfterSec}s.`
      });
    }

    // Step 5: Queue has space — add this request and allow it
    bucket.queue += 1; // request enters the queue

    // Attach queue info to response headers
    res.setHeader('X-RateLimit-Capacity',  capacity);
    res.setHeader('X-RateLimit-Queue',     bucket.queue);
    res.setHeader('X-RateLimit-Remaining', capacity - bucket.queue);

    return next();
  };
}

module.exports = leakyBucketLimiter;