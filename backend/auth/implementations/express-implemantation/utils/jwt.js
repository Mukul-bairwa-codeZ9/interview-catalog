/**
 * utils/jwt.js
 * ============
 * PURPOSE:
 *   Central place for all JWT operations — signing, verifying, decoding.
 *   Also contains PKCE (Proof Key for Code Exchange) helpers used in OAuth2 flows.
 *
 * WHY CENTRALIZE THIS?
 *   If you scatter jwt.sign() calls across routes, you get inconsistent expiry times,
 *   missing claims, and bugs that are hard to track. One place = one source of truth.
 *
 * USAGE EXAMPLE:
 * --------------
 *   const { signAccessToken, signRefreshToken, verifyToken } = require('./jwt');
 *
 *   // Sign
 *   const accessToken  = signAccessToken({ userId: '123', role: 'admin' });
 *   const refreshToken = signRefreshToken({ userId: '123' });
 *
 *   // Verify
 *   const payload = verifyToken(accessToken, 'access');
 *   // => { userId: '123', role: 'admin', iat: ..., exp: ... }
 *
 *   // PKCE
 *   const verifier   = generateCodeVerifier();
 *   const challenge  = generateCodeChallenge(verifier);
 *   const isValid    = verifyCodeChallenge(verifier, challenge);
 *
 * INTERVIEW TALKING POINT:
 *   "We use two separate secrets for access vs refresh tokens.
 *    This way, even if the access token secret leaks, an attacker
 *    cannot forge refresh tokens — they're signed with a different key."
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // built-in Node.js — no install needed

// ─── SECRETS ────────────────────────────────────────────────────────────────
//
// In production, load these from environment variables (never hardcode).
// Use two DIFFERENT secrets so access and refresh tokens are independent.
// If one key rotates or leaks, the other remains valid.
//
const ACCESS_TOKEN_SECRET  = process.env.ACCESS_TOKEN_SECRET  || 'access-secret-dev-only';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-dev-only';

// ─── TOKEN EXPIRY ────────────────────────────────────────────────────────────
//
// Access tokens are SHORT-LIVED (15m) — limits damage if stolen.
// Refresh tokens are LONG-LIVED (7d) — stored securely in DB/Redis.
//
// INTERVIEW: "Why short-lived access tokens?"
//   Because JWTs are stateless — you can't invalidate them server-side
//   once issued. Short expiry is your only safety net without a blocklist.
//
const ACCESS_TOKEN_EXPIRY  = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// ─── SIGN ACCESS TOKEN ───────────────────────────────────────────────────────
/**
 * Signs a short-lived access token.
 *
 * @param {Object} payload - Data to embed (userId, role, etc.)
 *                           NEVER put passwords or sensitive PII here.
 *                           The payload is base64-encoded, NOT encrypted.
 * @returns {string} signed JWT string
 *
 * INTERVIEW: "What goes in the payload?"
 *   Only what you need on every request: userId, role, maybe email.
 *   Keep it small — it's sent in every HTTP header.
 */
function signAccessToken(payload) {
  return jwt.sign(
    payload,
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'auth-service',     // "iss" claim — who created this token
      audience: 'my-app',         // "aud" claim — who this token is for
    }
  );
}

// ─── SIGN REFRESH TOKEN ──────────────────────────────────────────────────────
/**
 * Signs a long-lived refresh token.
 *
 * @param {Object} payload - Minimal payload, usually just { userId }
 *                           Refresh tokens do one job: get a new access token.
 *                           They don't need role/email in the payload.
 * @returns {string} signed JWT string
 *
 * INTERVIEW: "Where do you store refresh tokens?"
 *   Server-side in Redis (or DB). When a user logs out, you delete it.
 *   This is how you "invalidate" a stateless token — you reject it at lookup time.
 */
function signRefreshToken(payload) {
  return jwt.sign(
    payload,
    REFRESH_TOKEN_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: 'auth-service',
      audience: 'my-app',
    }
  );
}

// ─── VERIFY TOKEN ────────────────────────────────────────────────────────────
/**
 * Verifies a token's signature and expiry.
 *
 * @param {string} token - The JWT string to verify
 * @param {'access'|'refresh'} type - Which secret to use for verification
 * @returns {Object} decoded payload if valid
 * @throws {JsonWebTokenError} if signature is invalid
 * @throws {TokenExpiredError} if token is past its expiry
 *
 * INTERVIEW: "What does jwt.verify() actually check?"
 *   1. Signature — was this token signed with our secret?
 *   2. Expiry    — is `exp` claim still in the future?
 *   3. Issuer    — does `iss` match what we expect?
 *   4. Audience  — does `aud` match what we expect?
 *   All four in one call. If any fail, it throws.
 */
function verifyToken(token, type = 'access') {
  const secret = type === 'refresh' ? REFRESH_TOKEN_SECRET : ACCESS_TOKEN_SECRET;

  return jwt.verify(token, secret, {
    issuer: 'auth-service',
    audience: 'my-app',
  });
  // throws on failure — callers should wrap in try/catch
}

// ─── DECODE WITHOUT VERIFY ──────────────────────────────────────────────────
/**
 * Decodes a token WITHOUT verifying the signature.
 *
 * USE CASE: Reading the userId from an expired token during a refresh flow,
 * so you know which user is requesting the refresh before full verification.
 *
 * WARNING: Never use decoded data for authorization — anyone can craft a
 * base64 payload. This is for reading metadata only.
 *
 * @param {string} token
 * @returns {Object|null} decoded payload or null if malformed
 */
function decodeToken(token) {
  return jwt.decode(token); // no verification — just base64 decode
}

// ─── PKCE: GENERATE CODE VERIFIER ───────────────────────────────────────────
/**
 * Generates a cryptographically random code_verifier for PKCE.
 *
 * PKCE (Proof Key for Code Exchange) prevents authorization code interception.
 * The client creates a random secret (verifier), hashes it (challenge),
 * and sends the challenge to the auth server. Later proves it has the verifier.
 *
 * @returns {string} base64url-encoded random 32-byte string
 *
 * INTERVIEW: "Why PKCE?"
 *   Public clients (SPAs, mobile apps) can't keep a client_secret safe.
 *   PKCE proves the entity that started the flow is the same one finishing it.
 */
function generateCodeVerifier() {
  // 32 random bytes → 43-character base64url string
  // base64url uses - and _ instead of + and / (URL-safe, no padding)
  return crypto.randomBytes(32).toString('base64url');
}

// ─── PKCE: GENERATE CODE CHALLENGE ──────────────────────────────────────────
/**
 * Hashes the code_verifier using SHA-256 to produce the code_challenge.
 *
 * The challenge is what you send to the auth server upfront.
 * The verifier is what you prove later to redeem the auth code.
 *
 * @param {string} verifier - The code_verifier from generateCodeVerifier()
 * @returns {string} base64url-encoded SHA-256 hash of the verifier
 *
 * INTERVIEW: "Why SHA-256 and not plain text?"
 *   Plain (S256 is the method name) is also allowed in PKCE spec but only
 *   for legacy clients. SHA-256 ensures even if the challenge is intercepted,
 *   an attacker can't reverse it to get the verifier.
 */
function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url'); // URL-safe, no padding — matches OAuth2 spec
}

// ─── PKCE: VERIFY CODE CHALLENGE ────────────────────────────────────────────
/**
 * Verifies that a given verifier matches a previously-sent challenge.
 *
 * Called server-side when the client sends the verifier to redeem the auth code.
 *
 * @param {string} verifier   - The code_verifier from the client
 * @param {string} challenge  - The code_challenge stored from the initial request
 * @returns {boolean}
 */
function verifyCodeChallenge(verifier, challenge) {
  const expectedChallenge = generateCodeChallenge(verifier);

  // Use timingSafeEqual to prevent timing attacks
  // (comparing hashes character-by-character can leak info via response time)
  return crypto.timingSafeEqual(
    Buffer.from(expectedChallenge),
    Buffer.from(challenge)
  );
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
  // expose expiry constants for reference in other files
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
};