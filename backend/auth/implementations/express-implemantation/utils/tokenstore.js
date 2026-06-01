    /**
 * utils/tokenStore.js
 * ===================
 * PURPOSE:
 *   Server-side storage for refresh tokens and the JWT blocklist.
 *   This is HOW we invalidate JWTs — which are otherwise stateless and
 *   can't be "deleted" once issued.
 *
 * TWO RESPONSIBILITIES:
 *   1. Refresh Token Store — track which refresh tokens are active per user
 *   2. Access Token Blocklist — mark revoked access tokens so middleware rejects them
 *
 * STORAGE STRATEGY:
 *   Primary:  Redis (fast, TTL-aware, production-ready)
 *   Fallback: In-memory Map (for local dev/testing without Redis)
 *             Automatically used if Redis connection fails.
 *
 * USAGE EXAMPLE:
 * --------------
 *   const store = require('./tokenStore');
 *
 *   // Refresh token lifecycle
 *   await store.saveRefreshToken('user-123', 'token-abc', 7 * 24 * 3600); // save (7d TTL)
 *   const valid = await store.isRefreshTokenValid('user-123', 'token-abc'); // check
 *   await store.deleteRefreshToken('user-123', 'token-abc');               // logout
 *   await store.deleteAllRefreshTokens('user-123');                        // logout all devices
 *
 *   // Access token blocklist (on logout or password change)
 *   await store.blockAccessToken('jti-xyz', 900); // block for 15 min (access token TTL)
 *   const blocked = await store.isAccessTokenBlocked('jti-xyz');
 *
 * INTERVIEW TALKING POINT:
 *   "JWTs are stateless — the server can't 'delete' them. We solve this two ways:
 *    1. Short expiry (15 min) limits damage if a token is stolen.
 *    2. For immediate revocation (logout, password change), we add the token's JTI
 *       to a Redis blocklist. The middleware checks this list on every request."
 */

const Redis = require('ioredis');

// ─── REDIS CLIENT SETUP ──────────────────────────────────────────────────────
//
// ioredis auto-reconnects on disconnect. lazyConnect means we don't crash
// at startup if Redis isn't available — we fall back to in-memory.
//
let redisClient = null;
let useRedis = false;

// In-memory fallback — mimics Redis key-value with TTL (expires Map)
// Structure: Map<key, { value, expiresAt }>
const memoryStore = new Map();

/**
 * Initialize Redis connection.
 * Called once at app startup. If it fails, memory fallback is used silently.
 */
async function initRedis() {
  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,         // don't connect until first command
      maxRetriesPerRequest: 1,   // fail fast — don't hang the server
    });

    await redisClient.connect();
    useRedis = true;
    console.log('[tokenStore] Redis connected ✓');
  } catch (err) {
    console.warn('[tokenStore] Redis unavailable — using in-memory fallback:', err.message);
    useRedis = false;
  }
}

// Initialize on module load
initRedis();

// ─── LOW-LEVEL STORAGE HELPERS ───────────────────────────────────────────────
//
// These abstract away "Redis vs memory" so all higher-level functions
// don't need to know which backend they're using.
//

/**
 * SET key with optional TTL (seconds).
 */
async function set(key, value, ttlSeconds = null) {
  if (useRedis) {
    if (ttlSeconds) {
      await redisClient.set(key, value, 'EX', ttlSeconds); // EX = expire in X seconds
    } else {
      await redisClient.set(key, value);
    }
    return;
  }

  // In-memory fallback
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  memoryStore.set(key, { value, expiresAt });
}

/**
 * GET value for key. Returns null if missing or expired.
 */
async function get(key) {
  if (useRedis) {
    return await redisClient.get(key); // returns null if key doesn't exist
  }

  // In-memory fallback — check TTL manually
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key); // lazy eviction — clean up expired entries
    return null;
  }
  return entry.value;
}

/**
 * DELETE a key.
 */
async function del(key) {
  if (useRedis) {
    await redisClient.del(key);
    return;
  }
  memoryStore.delete(key);
}

/**
 * SADD — add a member to a Redis Set (used for multi-device token tracking).
 * In memory fallback: store a JSON array under the key.
 */
async function sadd(key, member, ttlSeconds = null) {
  if (useRedis) {
    await redisClient.sadd(key, member);
    if (ttlSeconds) {
      await redisClient.expire(key, ttlSeconds); // reset TTL on every add
    }
    return;
  }

  // In-memory: get existing set, add member, save back
  const existing = await get(key);
  const set = existing ? JSON.parse(existing) : [];
  if (!set.includes(member)) set.push(member);
  await set_memory_safe(key, JSON.stringify(set), ttlSeconds);
}

/**
 * SREM — remove a member from a Redis Set.
 */
async function srem(key, member) {
  if (useRedis) {
    await redisClient.srem(key, member);
    return;
  }

  const existing = await get(key);
  if (!existing) return;
  const arr = JSON.parse(existing).filter(m => m !== member);
  const entry = memoryStore.get(key);
  memoryStore.set(key, { value: JSON.stringify(arr), expiresAt: entry?.expiresAt });
}

/**
 * SISMEMBER — check if a member exists in a Redis Set.
 */
async function sismember(key, member) {
  if (useRedis) {
    const result = await redisClient.sismember(key, member);
    return result === 1;
  }

  const existing = await get(key);
  if (!existing) return false;
  return JSON.parse(existing).includes(member);
}

/**
 * DEL entire key (for sets — used in "logout all devices").
 */
async function delAll(key) {
  await del(key);
}

// Helper to avoid naming collision with built-in Set
async function set_memory_safe(key, value, ttlSeconds) {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  memoryStore.set(key, { value, expiresAt });
}

// ─── REFRESH TOKEN STORE ─────────────────────────────────────────────────────
//
// WHY STORE REFRESH TOKENS SERVER-SIDE?
//   Refresh tokens are long-lived (7 days). If one leaks, an attacker can
//   silently get new access tokens for a week. Storing them server-side lets
//   us delete them on logout or detect if they're used more than once
//   (refresh token rotation + reuse detection).
//
// KEY STRUCTURE:
//   "refresh:{userId}" → Redis Set of valid token strings for that user
//   One user can have multiple refresh tokens (multiple devices).
//

const REFRESH_KEY = (userId) => `refresh:${userId}`;

/**
 * Save a new refresh token for a user.
 * Used after login or token rotation.
 *
 * @param {string} userId
 * @param {string} token - The raw refresh token JWT string
 * @param {number} ttlSeconds - How long until it expires (match JWT expiry)
 */
async function saveRefreshToken(userId, token, ttlSeconds = 7 * 24 * 3600) {
  await sadd(REFRESH_KEY(userId), token, ttlSeconds);
}

/**
 * Check if a refresh token is still valid for a user.
 * Called in the /refresh route before issuing a new access token.
 *
 * @returns {boolean}
 *
 * INTERVIEW: "Why check the store AND verify the JWT?"
 *   JWT verify = signature + expiry check (cryptographic)
 *   Store check = is this token still active? (did user logout?)
 *   You need BOTH — a token can be valid cryptographically but already revoked.
 */
async function isRefreshTokenValid(userId, token) {
  return await sismember(REFRESH_KEY(userId), token);
}

/**
 * Delete a specific refresh token (single device logout).
 *
 * @param {string} userId
 * @param {string} token
 */
async function deleteRefreshToken(userId, token) {
  await srem(REFRESH_KEY(userId), token);
}

/**
 * Delete ALL refresh tokens for a user (logout from all devices).
 * Also useful after a password change — invalidates all sessions.
 *
 * @param {string} userId
 */
async function deleteAllRefreshTokens(userId) {
  await delAll(REFRESH_KEY(userId));
}

// ─── ACCESS TOKEN BLOCKLIST ──────────────────────────────────────────────────
//
// WHY A BLOCKLIST?
//   Access tokens are stateless JWTs — you can't delete them.
//   When a user logs out or changes password, existing access tokens remain
//   technically valid until they expire (up to 15 min).
//   The blocklist lets us immediately reject specific tokens.
//
// KEY STRUCTURE:
//   "blocklist:{jti}" → "1"   (jti = JWT ID, a unique claim per token)
//   TTL = access token remaining lifetime (no point keeping it after expiry)
//
// INTERVIEW: "What is JTI?"
//   JWT ID — a unique identifier in the payload: { jti: 'uuid-here', userId: ... }
//   We add it when signing. When blocking, we store this ID, not the whole token.
//

const BLOCKLIST_KEY = (jti) => `blocklist:${jti}`;

/**
 * Add an access token's JTI to the blocklist.
 * Called on logout to immediately invalidate the current access token.
 *
 * @param {string} jti - The JWT ID from the token payload
 * @param {number} ttlSeconds - How long to keep it (should match remaining token lifetime)
 */
async function blockAccessToken(jti, ttlSeconds = 900) { // 900s = 15min default
  await set(BLOCKLIST_KEY(jti), '1', ttlSeconds);
}

/**
 * Check if an access token's JTI is on the blocklist.
 * Called in authenticate middleware on every protected request.
 *
 * @param {string} jti
 * @returns {boolean} true = blocked (reject the request)
 */
async function isAccessTokenBlocked(jti) {
  const result = await get(BLOCKLIST_KEY(jti));
  return result !== null; // any value means it's blocked
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  // lifecycle
  initRedis,

  // refresh tokens
  saveRefreshToken,
  isRefreshTokenValid,
  deleteRefreshToken,
  deleteAllRefreshTokens,

  // access token blocklist
  blockAccessToken,
  isAccessTokenBlocked,
};