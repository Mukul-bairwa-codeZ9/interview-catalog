/**
 * middleware/authenticate.js
 * ==========================
 * PURPOSE:
 *   Express middleware that protects routes by verifying the JWT access token.
 *   Attach this to any route that requires the user to be logged in.
 *
 * WHAT IT DOES (in order):
 *   1. Extract token from Authorization header
 *   2. Verify signature + expiry using jwt.js
 *   3. Check if token is blocklisted (revoked on logout)
 *   4. Attach decoded payload to req.user for downstream route handlers
 *
 * USAGE EXAMPLE:
 * --------------
 *   const authenticate = require('../middleware/authenticate');
 *
 *   // Protect a single route
 *   app.get('/profile', authenticate, (req, res) => {
 *     res.json({ user: req.user }); // req.user is set by this middleware
 *   });
 *
 *   // Protect all routes under a prefix
 *   app.use('/api/dashboard', authenticate);
 *
 * EXPECTED HEADER FORMAT:
 *   Authorization: Bearer <access_token>
 *
 * INTERVIEW TALKING POINT:
 *   "The middleware is the single enforcement point for auth.
 *    By centralizing it here, every protected route gets the same
 *    checks — no risk of forgetting a check in one route.
 *    req.user is trusted downstream because this middleware validated it."
 */

const { verifyToken } = require('../utils/jwt');
const { isAccessTokenBlocked } = require('../utils/tokenstore');

/**
 * authenticate middleware
 *
 * On success: calls next() with req.user = { userId, role, jti, ... }
 * On failure: sends 401 with a descriptive error message
 *
 * INTERVIEW: "Why 401 and not 403?"
 *   401 Unauthorized = "I don't know who you are" (missing/invalid token)
 *   403 Forbidden    = "I know who you are, but you can't do this" (wrong role/permission)
 *   Missing or bad token → 401. Correct token, wrong permission → 403.
 */
async function authenticate(req, res, next) {
  try {
    // ── STEP 1: Extract token from header ──────────────────────────────────
    //
    // Standard format: "Authorization: Bearer <token>"
    // We split on space and take the second part.
    //
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing token',
        message: 'Authorization header must be: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1]; // "Bearer abc123" → "abc123"

    if (!token) {
      return res.status(401).json({ error: 'Empty token' });
    }

    // ── STEP 2: Verify signature + expiry ──────────────────────────────────
    //
    // verifyToken() throws on:
    //   - JsonWebTokenError  → bad signature, malformed token
    //   - TokenExpiredError  → token is past its `exp` claim
    //   - NotBeforeError     → token used before `nbf` claim
    //
    // If it passes, payload is guaranteed to be authentic and fresh.
    //
    let payload;
    try {
      payload = verifyToken(token, 'access');
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Access token has expired. Please refresh.',
        });
      }
      // Any other JWT error = bad/tampered token
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token signature verification failed.',
      });
    }

    // ── STEP 3: Check blocklist ────────────────────────────────────────────
    //
    // Even if the signature is valid, the token might be revoked (user logged out,
    // password changed). We check the JTI (unique token ID) against our blocklist.
    //
    // INTERVIEW: "What is JTI?"
    //   A unique ID we embed when signing: { jti: uuid(), userId: '...' }
    //   We store this ID in the blocklist, not the whole token string.
    //   This is efficient — storing a short UUID vs. a 300-char JWT.
    //
    if (payload.jti) {
      const blocked = await isAccessTokenBlocked(payload.jti);
      if (blocked) {
        return res.status(401).json({
          error: 'Token revoked',
          message: 'This token has been invalidated. Please log in again.',
        });
      }
    }

    // ── STEP 4: Attach user to request ────────────────────────────────────
    //
    // Downstream route handlers can trust req.user completely —
    // it was extracted from a cryptographically verified JWT.
    //
    // INTERVIEW: "Why attach to req.user and not res.locals?"
    //   Both work. req.user is the Express convention (used by Passport.js too).
    //   Consistency matters more than which you pick — document it and stick to it.
    //
    req.user = {
      userId: payload.userId,
      role:   payload.role,
      email:  payload.email,
      jti:    payload.jti,    // pass JTI forward (useful for logout route)
    };

    next(); // ✅ all checks passed — let the route handler run

  } catch (err) {
    // Unexpected error (e.g., Redis is down, code bug)
    // Log it internally, return generic message to client
    console.error('[authenticate] Unexpected error:', err);
    return res.status(500).json({ error: 'Authentication service error' });
  }
}

module.exports = authenticate;