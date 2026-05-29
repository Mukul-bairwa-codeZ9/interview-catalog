/**
 * FIXED WINDOW RATE LIMITER
 * =========================
 *
 * USAGE EXAMPLE:
 * --------------
 *   const fixedWindowLimiter = require('./fixedWindow');
 *
 *   // Allow 10 requests per 60 seconds per IP
 *   app.get('/fixed', fixedWindowLimiter({ windowMs: 60000, maxRequests: 10 }), (req, res) => {
 *     res.json({ message: 'Success' });
 *   });
 *
 * HOW IT WORKS (explain in interview):
 * -------------------------------------
 *   - Divide time into fixed buckets (e.g., 0–60s, 60–120s, 120–180s...)
 *   - Each IP gets a counter per bucket
 *   - Counter resets when the window expires (a new bucket starts)
 *   - Simple and memory-efficient, but has a known "boundary burst" flaw:
 *     A user can fire 10 requests at 0:59 and 10 more at 1:01 — 20 req in 2 seconds
 *
 * INTERVIEW TALKING POINTS:
 * --------------------------
 *   ✅ O(1) time and space per request
 *   ✅ Easy to implement and reason about
 *   ❌ Boundary burst problem (double traffic at window edges)
 *   ❌ Not smooth — all quota can be consumed instantly
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS   = 60 * 1000; // 60 seconds
const DEFAULT_MAX_REQUESTS = 10;        // max requests per window per IP

// ─── STORE ───────────────────────────────────────────────────────────────────

/**
 * store shape per IP key:
 * {
 *   count:       number,  // how many requests in this window
 *   windowStart: number   // timestamp (ms) when the current window began
 * }
 *
 * NOTE: In production, swap this Map for Redis so state is shared
 *       across multiple server instances (horizontal scaling).
 */
const store = new Map();

// ─── MIDDLEWARE FACTORY ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware function configured with the given options.
 *
 * @param {Object} options
 * @param {number} options.windowMs      - Duration of each window in ms (default 60000)
 * @param {number} options.maxRequests   - Max allowed requests per window (default 10)
 */
function fixedWindowLimiter(options = {}) {
  const windowMs    = options.windowMs    || DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;

  // Return the actual Express middleware function
  return function (req, res, next) {
    // Step 1: Identify the client
    // req.ip gives us the requester's IP address
    const ip  = req.ip;
    const now = Date.now(); // current timestamp in milliseconds

    // Step 2: Look up existing state for this IP
    const record = store.get(ip);

    // Step 3: Check if this IP has no record OR its window has expired
    if (!record || now - record.windowStart >= windowMs) {
      // Start a fresh window for this IP
      store.set(ip, {
        count:       1,   // this request is the first one in the new window
        windowStart: now  // window begins right now
      });

      // Request is allowed — pass to the next middleware/handler
      return next();
    }

    // Step 4: Window is still active — increment the counter
    record.count += 1;

    // Step 5: Check if the counter exceeds the allowed limit
    if (record.count > maxRequests) {
      // Calculate how many ms remain until the window resets
      const windowResetMs = windowMs - (now - record.windowStart);
      const retryAfterSec = Math.ceil(windowResetMs / 1000);

      // Set Retry-After header so clients know when to try again
      res.setHeader('Retry-After', retryAfterSec);

      // 429 Too Many Requests
      return res.status(429).json({
        error:       'Too Many Requests',
        algorithm:   'Fixed Window',
        limit:       maxRequests,
        windowMs:    windowMs,
        retryAfter:  `${retryAfterSec}s`,
        message:     `You have exceeded ${maxRequests} requests in ${windowMs / 1000}s. ` +
                     `Reset in ${retryAfterSec}s.`
      });
    }

    // Step 6: Counter is within limit — allow the request
    return next();
  };
}

module.exports = fixedWindowLimiter;