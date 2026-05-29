# Rate Limiting — Medium Interview Questions

> **Target:** Intermediate. Covers distributed challenges, algorithm tradeoffs, Redis internals, and real-world design decisions.
> **Format:** Core answer + example + follow-up trap (where applicable).

---

### Q1. How do you implement Fixed Window rate limiting in Redis?

**Answer:** Use `INCR` to increment a counter key per user per window. On the first request, set a `EXPIRE` on the key equal to the window size. If the counter exceeds the limit, reject the request. The key auto-deletes when the window expires.

**Example:**
```
Key: rate:user123:1717000000   ← Unix timestamp floored to window start

INCR rate:user123:1717000000
EXPIRE rate:user123:1717000000 60   ← set only if key is new (use SET NX or check TTL)

If counter > 100 → return 429
```

> ⚠️ **Follow-up trap:** "What's the race condition here?" — Between `INCR` and `EXPIRE`, another request can sneak in. Fix: use a Lua script to make both operations atomic.

---

### Q2. How do you implement Sliding Window Log in Redis?

**Answer:** Store each request as a timestamped entry in a sorted set (ZSET) per user. On each request: remove entries older than the window, count remaining entries, reject if over limit, otherwise add the new timestamp.

**Example:**
```
Key: rate:user123

ZREMRANGEBYSCORE rate:user123 0 (now - 60000)   ← remove entries older than 60s
count = ZCARD rate:user123
if count >= 100 → return 429
ZADD rate:user123 now now                        ← score = timestamp, member = timestamp
EXPIRE rate:user123 60
```

> ⚠️ **Follow-up trap:** "What's the memory problem?" — Every request is stored as an entry. High-traffic users create large ZSETs. Sliding Window Counter is a memory-efficient approximation.

---

### Q3. What is the Sliding Window Counter algorithm and how does it approximate the sliding window?

**Answer:** It uses two Fixed Window buckets — the current window and the previous window. The count is estimated as:

```
estimated = prev_count × (time remaining in prev window / window size) + curr_count
```

This approximates how many requests from the previous window still fall inside the rolling window, without storing individual timestamps.

**Example:** Window = 60s. At second 45 of the current window:
- prev_count = 80, curr_count = 30
- Weight = (60 - 45) / 60 = 0.25
- Estimated = 80 × 0.25 + 30 = **50 requests** in the rolling window

> ⚠️ **Follow-up trap:** "How accurate is this?" — It assumes requests in the previous window were evenly distributed, which is an approximation. Good enough for most production use cases.

---

### Q4. Why is rate limiting hard in a distributed system?

**Answer:** In a multi-instance deployment, each instance has its own memory. Without coordination, each instance maintains its own counter — so a user can hit N instances and consume N× the intended limit. You need a shared, atomic counter store (Redis) or a gossip/sync protocol between nodes.

**Example:** 3 app servers, limit = 100 req/min. User sends 100 requests to each server. Without shared state → 300 requests served. With Redis → counter is shared, 101st request anywhere returns 429.

> ⚠️ **Follow-up trap:** "What happens if Redis goes down?" — You need a fallback strategy: fail open (allow all traffic, risk abuse) or fail closed (block all traffic, risk outage). Most production systems fail open with alerting.

---

### Q5. What is the race condition in Redis-based rate limiting and how do you fix it?

**Answer:** When `INCR` and `EXPIRE` are two separate commands, another request can execute between them — especially at the start of a window. If the key expires between the two commands, EXPIRE resets an already-incremented key incorrectly, or never gets set.

**Fix:** Use a **Lua script** executed atomically on Redis:

```lua
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
```

Since Redis executes Lua scripts atomically, no other command can interleave.

> ⚠️ **Follow-up trap:** "What's another option besides Lua?" — Redis `SET key value NX EX seconds` for initialization, or use Redis Transactions (`MULTI/EXEC`) — though Lua is simpler and more reliable here.

---

### Q6. When would you choose Token Bucket over Sliding Window, and vice versa?

**Answer:**
- **Token Bucket** — when you want to allow controlled bursts. Users who haven't used their quota can accumulate tokens and spend them quickly. Good for APIs where occasional spikes are acceptable.
- **Sliding Window** — when you want strict, smooth enforcement with no burst allowance. Good for sensitive endpoints like `/login`, `/payment`, or SMS sending.

**Example:**
- Public search API → Token Bucket (burst of 50 is fine, average of 10/sec enforced)
- OTP endpoint → Sliding Window (max 5 in any 10-minute window, no bursting)

> ⚠️ **Follow-up trap:** "What's the memory cost difference?" — Token Bucket: O(1) per user (just store token count + last refill time). Sliding Window Log: O(requests in window) per user.

---

### Q7. How do you handle rate limiting for unauthenticated vs authenticated users differently?

**Answer:** Unauthenticated users are rate limited by IP (only identifier available). Authenticated users are rate limited by user ID or API key — which is more accurate and allows tiered limits based on plan.

**Example:**
```
Unauthenticated: 20 req/min per IP
Free tier user:  100 req/min per user_id
Pro tier user:   1000 req/min per user_id
Enterprise:      Custom limits per API key
```

**Implementation:** Middleware checks for auth token first. If present → use `user_id` as key. If absent → use `req.ip` as key.

> ⚠️ **Follow-up trap:** "What if many users share an IP (corporate NAT / mobile carrier)?" — IP-based limiting can block legitimate users. Prefer user-level limiting for authenticated APIs. For unauthenticated, consider IP + User-Agent fingerprinting.

---

### Q8. How does rate limiting work at the API Gateway level vs application middleware level?

**Answer:**
- **API Gateway** (Kong, AWS API Gateway, Nginx) — enforces limits before requests reach your service. Centralized, language-agnostic, no code changes needed per service. Ideal for global or per-route policies.
- **Application middleware** — enforced inside the app (e.g., Express middleware, NestJS guard). More flexible — can access business logic, user plans, feature flags. But must be implemented per service.

**Example:** Use API Gateway for global abuse protection (100 req/min per IP). Use app middleware for business-level limits (e.g., "free users can only export 2 reports/day").

> ⚠️ **Follow-up trap:** "Can you use both together?" — Yes. Gateway handles coarse-grained protection; app handles fine-grained business rules. Layered defense.

---

### Q9. What is a distributed rate limiter using Redis + Lua, and why is Lua preferred?

**Answer:** A distributed rate limiter stores counters in Redis so all app instances share state. Lua scripts are used because Redis executes them **atomically** — the entire script runs as a single operation with no interleaving from other clients. This eliminates race conditions without needing distributed locks.

**Example (Token Bucket in Lua):**
```lua
local tokens = tonumber(redis.call('GET', KEYS[1])) or ARGV[2]
local now = tonumber(ARGV[1])
local last = tonumber(redis.call('GET', KEYS[2])) or now
local refill = (now - last) * tonumber(ARGV[3])  -- rate * elapsed time
tokens = math.min(tonumber(ARGV[2]), tokens + refill)
redis.call('SET', KEYS[2], now)
if tokens >= 1 then
  redis.call('SET', KEYS[1], tokens - 1)
  return 1  -- allowed
else
  return 0  -- rejected
end
```

> ⚠️ **Follow-up trap:** "What's the downside of Lua on Redis?" — Long-running scripts block all other Redis operations. Keep scripts short and fast.

---

### Q10. How do you design rate limiting for a multi-tenant SaaS API?

**Answer:** Each tenant (org/account) gets isolated limits based on their subscription tier. Rate limit keys are namespaced by tenant ID. Limits are stored in config (DB or feature flag service) and fetched per request. You also want per-endpoint limits layered on top of global tenant limits.

**Example:**
```
Key: rate:{tenant_id}:{endpoint}:{window}

Starter plan:    500 req/min global, 50 req/min per endpoint
Growth plan:     5000 req/min global, 500 req/min per endpoint
Enterprise:      Custom, negotiated per contract
```

**Design considerations:**
- Store tenant limits in a config service or Redis hash (fast lookup)
- Expose limit headers so tenants can monitor usage
- Send warning alerts at 80% usage before hard blocking

> ⚠️ **Follow-up trap:** "How do you handle a tenant who needs a temporary limit increase?" — Dynamic overrides stored in Redis/DB, checked before the default limit. Expires after a set time.

---

### Q11. What tradeoffs do you make when choosing between in-memory vs Redis-based rate limiting?

**Answer:**

| | In-Memory | Redis |
|---|---|---|
| **Speed** | Fastest (no network) | Fast (sub-ms latency) |
| **Consistency** | Per-instance only | Shared across all instances |
| **Failure** | No external dependency | Redis outage = fallback needed |
| **Scalability** | Breaks with multiple instances | Scales horizontally |
| **Use case** | Single-instance apps, dev/test | Any production distributed system |

**Example:** A single-server Express app with no horizontal scaling can use in-memory (`express-rate-limit` default store). A NestJS app on 5 pods on Kubernetes must use Redis store.

> ⚠️ **Follow-up trap:** "What's the latency cost of Redis?" — Typically 0.5–2ms per rate limit check. Acceptable for most APIs. For ultra-low latency, consider local cache + async sync to Redis (though this reintroduces some inconsistency).

---

### Q12. How do you prevent rate limit bypass via distributed requests?

**Answer:** A sophisticated client can spread requests across many IPs, user agents, or accounts to avoid triggering per-IP or per-user limits. Defenses include:

- **Fingerprinting** — combine IP + User-Agent + Accept-Language + TLS fingerprint
- **Behavioral analysis** — flag accounts with identical request patterns
- **CAPTCHA on threshold** — challenge suspicious clients before blocking
- **Global rate limiting** — cap total requests per endpoint regardless of source
- **Honeypot endpoints** — detect scrapers probing undocumented routes

**Example:** A scraper rotates through 100 IPs, each sending 99 req/min (just under the 100 limit). Global endpoint cap of 5000 req/min catches this even if per-IP limits aren't triggered.

> ⚠️ **Follow-up trap:** "Where does rate limiting end and WAF/DDoS protection begin?" — Rate limiting handles application-level abuse per client. WAF and DDoS protection (Cloudflare, AWS Shield) handle network-level volumetric attacks at scale.

---

## Quick Reference — Medium Concepts

| Topic | Key Insight |
|---|---|
| Redis Fixed Window | `INCR` + `EXPIRE` — use Lua for atomicity |
| Redis Sliding Window Log | ZSET with timestamps — memory-heavy |
| Sliding Window Counter | Approximation using two buckets — memory efficient |
| Distributed consistency | Shared Redis counter across all instances |
| Race condition fix | Lua script = atomic execution on Redis |
| Token vs Sliding | Token allows burst; Sliding is strict |
| Gateway vs Middleware | Gateway = coarse global; Middleware = fine business logic |
| Multi-tenant design | Namespace by tenant, tier-based limits, dynamic overrides |

---

*Previous: [`easy/README.md`](../easy/README.md) · Next: [`advanced/README.md`](../advanced/README.md)*