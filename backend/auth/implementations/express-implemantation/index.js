/**
 * index.js
 * ========
 * PURPOSE:
 *   Entry point for the auth Express app.
 *   Sets up middleware, mounts routes, and starts the server.
 *   Also includes a sample protected route to demo the authenticate middleware.
 *
 * HOW TO RUN:
 * -----------
 *   1. Install dependencies:
 *      npm install express jsonwebtoken bcrypt ioredis
 *
 *   2. Set environment variables (optional — defaults work for local dev):
 *      export ACCESS_TOKEN_SECRET=your-secret-here
 *      export REFRESH_TOKEN_SECRET=your-other-secret
 *      export REDIS_HOST=127.0.0.1
 *      export REDIS_PORT=6379
 *
 *   3. Run:
 *      node index.js
 *
 * AVAILABLE ROUTES:
 * -----------------
 *   POST   /auth/register         — create account
 *   POST   /auth/login            — get access + refresh tokens
 *   POST   /auth/refresh          — rotate tokens
 *   POST   /auth/logout           — revoke tokens  [protected]
 *   GET    /profile               — demo protected route [protected]
 *   GET    /health                — server health check
 *
 * QUICK TEST WITH CURL:
 * ---------------------
 *   # Register
 *   curl -X POST http://localhost:3000/auth/register \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"test@test.com","password":"password123"}'
 *
 *   # Login
 *   curl -X POST http://localhost:3000/auth/login \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"test@test.com","password":"password123"}'
 *
 *   # Access protected route (paste accessToken from login)
 *   curl http://localhost:3000/profile \
 *     -H "Authorization: Bearer <accessToken>"
 *
 *   # Refresh
 *   curl -X POST http://localhost:3000/auth/refresh \
 *     -H "Content-Type: application/json" \
 *     -d '{"refreshToken":"<refreshToken>"}'
 *
 *   # Logout
 *   curl -X POST http://localhost:3000/auth/logout \
 *     -H "Authorization: Bearer <accessToken>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"refreshToken":"<refreshToken>"}'
 *
 * INTERVIEW TALKING POINT:
 *   "index.js is intentionally thin — it wires things together but contains
 *    no business logic. All logic lives in routes/ and utils/.
 *    This separation makes the app easy to test and reason about."
 */

const express = require('express');

const authRoutes   = require('./routes/auth');
const authenticate = require('./middleware/authenticate');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── GLOBAL MIDDLEWARE ────────────────────────────────────────────────────────

// Parse JSON bodies on all routes
// INTERVIEW: "Why not use bodyParser package?"
//   express.json() is built-in since Express 4.16.0.
//   bodyParser is what Express uses internally — no need to install it separately.
app.use(express.json());

// Basic security headers
// INTERVIEW: "In production what do you add here?"
//   helmet.js — sets Content-Security-Policy, X-Frame-Options, HSTS, etc.
//   cors()    — configure which origins can call your API
//   rate limiter on /auth routes — prevent brute force
//
// app.use(require('helmet')());
// app.use(require('cors')({ origin: 'https://yourapp.com' }));

// Request logger (minimal — use morgan or pino in production)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Auth routes (public — no authentication required to hit these)
app.use('/auth', authRoutes);

// ─── PROTECTED ROUTE: GET /profile ───────────────────────────────────────────
//
// Demo of how to protect a route using the authenticate middleware.
// authenticate runs first, validates the JWT, sets req.user.
// If it fails, it sends 401 and the route handler never runs.
//
// INTERVIEW: "How do you protect a route?"
//   Pass the middleware as the second argument: app.get('/route', authenticate, handler)
//   Or use app.use('/prefix', authenticate) to protect all routes under that prefix.
//
app.get('/profile', authenticate, (req, res) => {
  // req.user is guaranteed to exist here — authenticate middleware set it
  return res.status(200).json({
    message:  'This is your profile — you are authenticated!',
    user:     req.user,
    fetchedAt: new Date().toISOString(),
  });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
//
// Unprotected endpoint — used by load balancers and monitoring tools
// to verify the server is running. Returns 200 = healthy.
//
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── CATCH-ALL: 404 ───────────────────────────────────────────────────────────
//
// Any request that didn't match a route above falls here.
// Must come AFTER all route definitions.
//
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
//
// Express recognizes this as an error handler because it has 4 params (err, req, res, next).
// Called when a route does: next(err)
//
// INTERVIEW: "Why a global error handler?"
//   Centralizes error logging and ensures consistent error response format.
//   Without it, unhandled errors crash the request with a default Express error page.
//
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Auth Service running on port ${PORT}     ║
╠══════════════════════════════════════════╣
║  POST  /auth/register                   ║
║  POST  /auth/login                      ║
║  POST  /auth/refresh                    ║
║  POST  /auth/logout    [protected]      ║
║  GET   /profile        [protected]      ║
║  GET   /health                          ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app; // export for testing