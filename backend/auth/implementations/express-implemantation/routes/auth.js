/**
 * routes/auth.js
 * ==============
 * PURPOSE:
 *   All authentication-related routes in one place:
 *   POST /register  — create a new user account
 *   POST /login     — verify credentials, issue tokens
 *   POST /refresh   — use refresh token to get a new access token
 *   POST /logout    — revoke tokens for this device
 *
 * DEPENDENCIES:
 *   express          — routing
 *   bcrypt           — password hashing (never store plain text)
 *   crypto           — generate JTI (unique token IDs) and PKCE verifiers
 *   ../utils/jwt     — sign/verify tokens
 *   ../utils/tokenStore — refresh token store + blocklist
 *
 * USAGE EXAMPLE:
 * --------------
 *   // In index.js:
 *   const authRoutes = require('./routes/auth');
 *   app.use('/auth', authRoutes);
 *
 *   // Then call:
 *   POST /auth/register  { "email": "a@b.com", "password": "secret" }
 *   POST /auth/login     { "email": "a@b.com", "password": "secret" }
 *   POST /auth/refresh   { "refreshToken": "<token>" }
 *   POST /auth/logout    (Authorization: Bearer <access_token> required)
 *
 * INTERVIEW TALKING POINT:
 *   "I keep routes thin — they validate input, call utilities, and return responses.
 *    The actual business logic (JWT signing, token storage) lives in utils.
 *    This makes the code testable and the flow easy to explain."
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');

const {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
} = require('../utils/jwt');

const {
  saveRefreshToken,
  isRefreshTokenValid,
  deleteRefreshToken,
  blockAccessToken,
} = require('../utils/tokenstore');

const authenticate = require('../middleware/authenticate');

const router = express.Router();

// ─── IN-MEMORY USER STORE ────────────────────────────────────────────────────
//
// For interview demo purposes — replaces a real database.
// In production this would be Postgres/MongoDB with a users table.
//
// Structure: Map<email, { userId, email, passwordHash, role }>
//
const users = new Map();

// ─── HELPER: Build token payload ─────────────────────────────────────────────
/**
 * Creates a consistent payload object for access tokens.
 * Centralizing this ensures all tokens have the same shape.
 *
 * INTERVIEW: "What claims do you include in the JWT payload?"
 *   userId — who this token belongs to
 *   email  — convenient for display (avoid re-fetching user)
 *   role   — for basic RBAC (admin vs user)
 *   jti    — unique ID for blocklisting this specific token
 */
function buildAccessPayload(user) {
  return {
    userId: user.userId,
    email:  user.email,
    role:   user.role,
    jti:    crypto.randomUUID(), // unique ID per token — used for blocklist
  };
}

// ─── POST /register ──────────────────────────────────────────────────────────
/**
 * Create a new user account.
 *
 * FLOW:
 *   1. Validate input
 *   2. Check for duplicate email
 *   3. Hash password with bcrypt
 *   4. Save user
 *   5. Return success (no tokens yet — user must login)
 *
 * INTERVIEW: "Why not return tokens after registration?"
 *   Forces the user to go through the login flow. Keeps registration
 *   simple and single-purpose. Some apps do issue tokens — but then
 *   you need to handle email verification too. Separate concerns.
 *
 * INTERVIEW: "Why bcrypt?"
 *   bcrypt is slow by design. Its cost factor (salt rounds) makes brute-force
 *   attacks expensive. MD5/SHA-256 are too fast — attackers can try
 *   billions/second. bcrypt at cost 12 takes ~200ms per hash.
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Basic email format check (in production, use a proper validation library)
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // ── Duplicate check ───────────────────────────────────────────────────
    if (users.has(email)) {
      return res.status(409).json({ error: 'Email already registered' });
      // 409 Conflict = resource already exists
    }

    // ── Hash password ─────────────────────────────────────────────────────
    //
    // saltRounds = 12: ~200ms per hash — good balance of security vs UX.
    // bcrypt automatically generates and embeds a random salt.
    // You NEVER need to store the salt separately — it's inside the hash string.
    //
    const saltRounds   = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // ── Save user ─────────────────────────────────────────────────────────
    const userId = crypto.randomUUID();
    const user   = { userId, email, passwordHash, role: 'user' };
    users.set(email, user);

    // Return created user (no sensitive data)
    return res.status(201).json({
      message: 'Account created successfully',
      userId,
      email,
    });

  } catch (err) {
    console.error('[/register] Error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /login ─────────────────────────────────────────────────────────────
/**
 * Verify credentials and issue access + refresh tokens.
 *
 * FLOW:
 *   1. Validate input
 *   2. Look up user by email
 *   3. Compare password with stored hash using bcrypt
 *   4. Sign access token + refresh token
 *   5. Store refresh token server-side
 *   6. Return both tokens
 *
 * INTERVIEW: "Why two tokens instead of one?"
 *   Access token: short-lived (15m), sent on every API request.
 *     If stolen, expires soon — damage is limited.
 *   Refresh token: long-lived (7d), sent only to /refresh endpoint.
 *     Stored server-side so we can revoke it on logout.
 *
 * INTERVIEW: "Should refresh tokens go in cookies or response body?"
 *   HttpOnly cookie = more secure (JS can't read it — XSS protection)
 *   Response body   = simpler for mobile apps / non-browser clients
 *   This demo uses response body for simplicity. Production = HttpOnly cookie.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // ── Look up user ──────────────────────────────────────────────────────
    const user = users.get(email);

    // INTERVIEW: "Why not say 'user not found' explicitly?"
    //   Saying "user not found" tells attackers which emails are registered.
    //   "Invalid credentials" is vague — doesn't reveal which field was wrong.
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ── Verify password ───────────────────────────────────────────────────
    //
    // bcrypt.compare hashes the input and compares it to the stored hash.
    // Timing-safe by default (no early return on first mismatch).
    //
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ── Sign tokens ───────────────────────────────────────────────────────
    const accessPayload  = buildAccessPayload(user);
    const refreshPayload = { userId: user.userId }; // minimal — refresh token does one job

    const accessToken  = signAccessToken(accessPayload);
    const refreshToken = signRefreshToken(refreshPayload);

    // ── Store refresh token ───────────────────────────────────────────────
    //
    // TTL = 7 days in seconds. Must match the JWT expiry.
    // If they diverge, Redis entry could outlive the JWT (waste) or
    // expire before the JWT (forces premature re-login).
    //
    await saveRefreshToken(user.userId, refreshToken, 7 * 24 * 3600);

    return res.status(200).json({
      accessToken,
      refreshToken,
      expiresIn: '15m',
      tokenType: 'Bearer',
    });

  } catch (err) {
    console.error('[/login] Error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────
/**
 * Issue a new access token using a valid refresh token.
 *
 * FLOW:
 *   1. Verify refresh token signature + expiry (jwt.verify)
 *   2. Check if refresh token is still active in our store
 *   3. Look up the user (to get fresh role/email claims)
 *   4. Issue new access token
 *   5. (Optional) Rotate refresh token for extra security
 *
 * INTERVIEW: "What is refresh token rotation?"
 *   Every time you use a refresh token, you delete the old one and issue a new one.
 *   If an attacker steals a refresh token and uses it AFTER the real user,
 *   the user's next /refresh will fail (old token is gone) and you can detect
 *   the compromise. This is called "reuse detection."
 *   We implement rotation here — see step 5.
 *
 * INTERVIEW: "Why re-fetch user data here?"
 *   If a user's role changed (admin → user) between logins, we want the new
 *   access token to reflect the current role, not the stale one in the old token.
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // ── Step 1: Verify JWT signature + expiry ─────────────────────────────
    let payload;
    try {
      payload = verifyToken(refreshToken, 'refresh');
    } catch (err) {
      return res.status(401).json({
        error: err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token',
      });
    }

    const { userId } = payload;

    // ── Step 2: Check server-side store ───────────────────────────────────
    //
    // Even if JWT is cryptographically valid, check our store.
    // The token might have been deleted on logout.
    //
    const isValid = await isRefreshTokenValid(userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({
        error: 'Refresh token not recognized — please log in again',
        // INTERVIEW: "This could mean: token was already used (rotation reuse detected),
        //             or user explicitly logged out, or token was never issued by us."
      });
    }

    // ── Step 3: Fetch fresh user data ─────────────────────────────────────
    //
    // Find user by userId (scan values — in production, DB query by userId index)
    //
    const user = [...users.values()].find(u => u.userId === userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ── Step 4: Issue new access token ────────────────────────────────────
    const newAccessToken = signAccessToken(buildAccessPayload(user));

    // ── Step 5: Rotate refresh token ──────────────────────────────────────
    //
    // Delete old refresh token, issue a new one.
    // This limits the refresh token's effective lifespan — each use restarts
    // the window, so active users stay logged in, inactive ones get logged out.
    //
    await deleteRefreshToken(userId, refreshToken);

    const newRefreshToken = signRefreshToken({ userId });
    await saveRefreshToken(userId, newRefreshToken, 7 * 24 * 3600);

    return res.status(200).json({
      accessToken:  newAccessToken,
      refreshToken: newRefreshToken, // always return the NEW refresh token
      expiresIn:    '15m',
      tokenType:    'Bearer',
    });

  } catch (err) {
    console.error('[/refresh] Error:', err);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────
/**
 * Revoke the current session's tokens.
 *
 * FLOW:
 *   1. authenticate middleware validates access token (sets req.user)
 *   2. Add access token JTI to blocklist
 *   3. Delete refresh token from store
 *
 * INTERVIEW: "Why blocklist the access token if it expires in 15 min anyway?"
 *   Logout should be immediate. A user expects "logout" to mean "now."
 *   If we skip the blocklist, the stolen access token is valid for up to 15 min
 *   after logout. For low-risk apps that's fine. For banking? Blocklist it.
 *   Trade-off: blocklist check adds one Redis round-trip per request.
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { userId, jti } = req.user; // set by authenticate middleware
    const { refreshToken } = req.body;

    // ── Block current access token ────────────────────────────────────────
    if (jti) {
      // TTL = 900s (15 min) — matches the access token's max lifetime.
      // After expiry, the token is useless anyway, so the blocklist entry is auto-cleaned.
      await blockAccessToken(jti, 900);
    }

    // ── Delete refresh token ──────────────────────────────────────────────
    if (refreshToken) {
      await deleteRefreshToken(userId, refreshToken);
    }

    return res.status(200).json({ message: 'Logged out successfully' });

  } catch (err) {
    console.error('[/logout] Error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;