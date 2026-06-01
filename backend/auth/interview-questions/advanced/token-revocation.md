# Token Revocation

**Difficulty:** 🔴 Advanced  
**Asked by:** Banking, healthcare, Stripe, Okta, Auth0, any high-security system design round

---

## Q1: Why is JWT revocation hard?

**Plain Answer:**  
JWTs are **stateless** — the server doesn't store them anywhere. Validity is determined purely by the signature and expiry. There's no central registry to update, so you can't just "delete" a JWT the way you'd delete a session.

**The core tension:**  
> JWTs are valuable *because* they're stateless. Revocation forces you to add state back.

**Interview Template Answer:**  
> "JWT revocation is inherently difficult because the whole value proposition of JWTs is statelessness — any server can verify them without a database call. When you revoke a JWT, you're fighting against that design. The token is still cryptographically valid until its `exp` claim passes. There's no built-in mechanism in the JWT spec to mark a token as invalid mid-lifetime. Every revocation strategy adds some form of state back, which reintroduces the infrastructure cost that JWTs were meant to avoid. The question is always: how much state do you add, and where?"

---

## Q2: What are the strategies for revoking JWTs?

**Plain Answer:**

### Strategy 1: Short Expiry (Accept the window)
Let tokens expire quickly (5–15 min). Accept that revoked tokens remain valid for a short window.

- ✅ Fully stateless
- ❌ Not instant revocation — attacker has a window
- **Use when**: Low-risk actions, UX matters more than instant revocation

---

### Strategy 2: Token Blocklist (Denylist)
Store revoked JTI (JWT ID) values in Redis. Check every request against the blocklist.

```
On revoke:  Redis.SET(jti, "revoked", EX: token_ttl)
On verify:  if Redis.GET(jti) exists → reject
```

- ✅ Instant revocation
- ❌ Adds a Redis lookup to every request (latency)
- ❌ Blocklist grows until tokens expire
- **Use when**: Logout, password change, account suspension

---

### Strategy 3: Token Versioning
Store a `token_version` per user in DB. Include it in the JWT. On revoke, increment the version. Token version must match DB version.

```js
// In JWT payload
{ userId: "123", tokenVersion: 5 }

// On verify
const user = await db.find(userId);
if (payload.tokenVersion !== user.tokenVersion) reject();

// On revoke (e.g., password change)
await db.update(userId, { tokenVersion: tokenVersion + 1 });
```

- ✅ Instant revocation of ALL tokens for a user (global logout)
- ❌ One DB lookup per request — partially stateful
- **Use when**: Password change, "logout all devices", account compromise

---

### Strategy 4: Short-lived Access + Refresh Token Rotation
Don't revoke access tokens — let them expire. Revoke the refresh token instead.

- ✅ Mostly stateless for access tokens
- ✅ Revocation effective within access token TTL
- ❌ Access token remains valid during its remaining lifetime
- **Use when**: Standard apps — best balance of security and scalability

**Interview Template Answer:**  
> "There are four main strategies, each with different trade-offs. First, short expiry — simply accept that revoked tokens remain valid for a brief window (5–15 min). This is fully stateless but not instant. Second, a blocklist in Redis — store the JTI of each revoked token with a TTL matching the token's expiry. Every request checks Redis; if the JTI is found, reject. This is instant but adds a cache lookup per request. Third, token versioning — store a version number in the JWT and in the user's DB record. Increment the version to invalidate all existing tokens. This enables instant global logout with one DB write, at the cost of a DB read per request. Fourth, the refresh token pattern — keep access tokens short-lived and only revoke long-lived refresh tokens, which are stored server-side anyway. In practice, I'd combine strategies: short access tokens (15 min) + refresh token rotation + a Redis blocklist triggered only on sensitive events like logout or password change."

---

## Q3: How do you implement a JWT blocklist efficiently?

**Plain Answer:**  
Use Redis with TTL set to the remaining token lifetime. The blocklist self-cleans as tokens expire naturally — no manual cleanup needed.

```js
// On logout / forced revocation
async function revokeToken(token) {
  const payload = jwt.decode(token); // decode without verifying — we already verified it
  const jti = payload.jti;           // unique token ID
  const ttl = payload.exp - Math.floor(Date.now() / 1000); // remaining lifetime in seconds

  if (ttl > 0) {
    await redis.set(`blocklist:${jti}`, '1', 'EX', ttl);
  }
}

// In auth middleware — after signature verification
async function isRevoked(payload) {
  const result = await redis.get(`blocklist:${payload.jti}`);
  return result !== null; // true = revoked
}
```

**Key requirement:** Every JWT must have a `jti` (JWT ID) claim — a unique identifier per token.

**Interview Template Answer:**  
> "The blocklist pattern in Redis works well because Redis TTL handles garbage collection automatically. When a token is revoked, we decode it to get its `jti` and compute remaining lifetime from `exp - now`. We store the JTI in Redis with that TTL — when the token would naturally expire, Redis automatically evicts the key. The blocklist never grows unboundedly. In the auth middleware, after verifying the signature, we do a Redis GET on the JTI. A hit means the token is revoked. The latency hit is typically under 1ms for a Redis call, which is acceptable. The important prerequisite is that all issued JWTs must include a `jti` claim — without it, you can't reference individual tokens."

---

## Q4: How do you handle "logout from all devices"?

**Plain Answer:**  
Token versioning is the cleanest approach. Incrementing `token_version` in the DB immediately invalidates all existing tokens across all devices — no need to track individual tokens.

```js
// Logout all devices
async function logoutAllDevices(userId) {
  await db.users.update(
    { id: userId },
    { $inc: { tokenVersion: 1 } }  // increment invalidates all existing JWTs
  );
}

// In JWT payload when issuing
{ userId: "123", tokenVersion: user.tokenVersion }

// In auth middleware
const user = await db.users.findOne({ id: payload.userId });
if (payload.tokenVersion !== user.tokenVersion) {
  throw new Error('Token invalidated — please log in again');
}
```

**Interview Template Answer:**  
> "For 'logout all devices', token versioning is the most elegant solution. Each user has a `tokenVersion` field in the database. When issuing a JWT, we embed the current version. In the auth middleware, we fetch the user's current version and compare — if they don't match, the token is rejected. To invalidate all sessions, we increment the version with a single DB update. All existing tokens, regardless of where they're stored — browser, mobile, desktop — immediately become invalid on their next request. The downside is one DB read per request, but this can be mitigated by caching the version in Redis with a short TTL."

---

## Quick Comparison

| Strategy | Revocation Speed | Statefulness | Best For |
|---|---|---|---|
| Short expiry | Eventual (TTL) | None | Low-risk tokens |
| Redis blocklist | Instant | Per-token in Redis | Individual logout |
| Token versioning | Instant | Per-user in DB | Logout all devices |
| Refresh token revocation | Eventual (access TTL) | Per-refresh-token | Standard apps |

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| Does the JWT spec support revocation natively? | No — RFC 7519 has no revocation mechanism; it's an application-level concern |
| What is `jti` claim? | JWT ID — a unique identifier for the token, required for blocklist-based revocation |
| Can you revoke without any state? | No — true stateless revocation is impossible; you need state somewhere |
| How does OAuth 2.0 handle revocation? | RFC 7009 defines a token revocation endpoint for OAuth servers |