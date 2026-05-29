/**
 * SLIDING WINDOW RATE LIMITER
 * ============================
 *
 * USAGE EXAMPLE:
 * --------------
 *   const slidingWindowLimiter = require('./slidingWindow');
 *
 *   // Allow 10 requests in any rolling 60-second window per IP
 *   app.get('/sliding', slidingWindowLimiter({ windowMs: 60000, maxRequests: 10 }), (req, res) => {
 *     res.json({ message: 'Success' });
 *   });
 *
 * HOW IT WORKS (explain in interview):
 * -------------------------------------
 *   - Instead of fixed time buckets, we keep a log of EXACT timestamps
 *     for every request made by each IP
 *   - On each new request:
 *       1. Remove all timestamps older than (now - windowMs)  ← "slide" the window
 *       2. Count what remains
 *       3. If count < limit → allow, add current timestamp
 *       4. If count >= limit → reject with 429
 *   - The window "slides" with every request — no boundary burst problem
 *
 * INTERVIEW TALKING POINTS:
 * --------------------------
 *   ✅ No boundary burst (fixes Fixed Window's main flaw)
 *   ✅ Precise — enforces exact rolling window
 *   ❌ Higher memory usage — stores every timestamp per user
 *   ❌ If limit is 10,000/day, storing 10k timestamps per IP is heavy
 *   💡 Hybrid: "Sliding Window Counter" approximates this with less memory
 *              by combining two fixed windows with a weighted formula
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS    = 60 * 1000; // 60 seconds
const DEFAULT_MAX_REQUESTS = 10;        // max requests per rolling window per IP

// ─── STORE ───────────────────────────────────────────────────────────────────

/**
 * store shape per IP key:
 * {
 *   timestamps: number[]  // array of request timestamps (ms) within current window
 * }
 *
 * NOTE: In production, use Redis Sorted Sets (ZADD / ZREMRANGEBYSCORE / ZCARD)
 *       which are purpose-built for this pattern and atomic across instances.
 */
const store = new Map();

// ─── MIDDLEWARE FACTORY ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware function configured with the given options.
 *
 * @param {Object} options
 * @param {number} options.windowMs      - Rolling window duration in ms (default 60000)
 * @param {number} options.maxRequests   - Max allowed requests in that window (default 10)
 */
function slidingWindowLimiter(options = {}) {
  const windowMs    = options.windowMs    || DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;

  return function (req, res, next) {
    // Step 1: Identify the client
    const ip  = req.ip;
    const now = Date.now();

    // Step 2: Retrieve this IP's timestamp log (or start fresh)
    if (!store.has(ip)) {
      store.set(ip, { timestamps: [] });
    }
    const record = store.get(ip);

    // Step 3: SLIDE the window — drop timestamps that are outside the window
    // cutoff = the oldest timestamp still inside the rolling window
    const cutoff = now - windowMs;
    record.timestamps = record.timestamps.filter(ts => ts > cutoff);
    // After this filter, every timestamp left is within (now - windowMs, now]

    // Step 4: Count valid requests in the current rolling window
    const requestCount = record.timestamps.length;

    // Step 5: Check against the limit
    if (requestCount >= maxRequests) {
      // The oldest timestamp in the window tells us when a slot frees up
      const oldestTimestamp = record.timestamps[0]; // array is chronologically ordered
      const retryAfterMs    = oldestTimestamp + windowMs - now;
      const retryAfterSec   = Math.ceil(retryAfterMs / 1000);

      res.setHeader('Retry-After', retryAfterSec);

      return res.status(429).json({
        error:       'Too Many Requests',
        algorithm:   'Sliding Window',
        limit:       maxRequests,
        windowMs:    windowMs,
        currentCount: requestCount,
        retryAfter:  `${retryAfterSec}s`,
        message:     `You have made ${requestCount} requests in the last ${windowMs / 1000}s. ` +
                     `A slot opens in ${retryAfterSec}s.`
      });
    }

    // Step 6: Under the limit — log this request's timestamp and allow it
    record.timestamps.push(now); // push at the end (chronological order)

    return next();
  };
}

module.exports = slidingWindowLimiter;