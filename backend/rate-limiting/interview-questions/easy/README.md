# Rate Limiting — Easy Interview Questions

> **Target:** Beginner-friendly. Covers definitions, basic algorithms, and common use cases.
> **Format:** Core answer + example + follow-up trap (where applicable).

---

### Q1. What is rate limiting?

**Answer:** Rate limiting is a technique used to control how many requests a client can make to a server within a defined time window. It protects backend services from being overwhelmed by too many requests — whether from a bug, abuse, or a DDoS attack.

**Example:** A public REST API allows 100 requests per minute per user. On the 101st request, the server responds with `429 Too Many Requests`.

> ⚠️ **Follow-up trap:** "What's the difference between rate limiting and throttling?" — Throttling slows down responses; rate limiting hard-blocks them after a threshold.

---

### Q2. Why do we need rate limiting?

**Answer:** Without rate limiting, a single client can exhaust server resources, degrade service for everyone, or exploit endpoints. Rate limiting ensures fair usage, protects availability, and reduces infrastructure cost.

**Example:** A free-tier user hitting your `/search` endpoint 10,000 times/minute could spike your database load and slow down paid users.

---

### Q3. What HTTP status code is returned when a request is rate limited?

**Answer:** `429 Too Many Requests`. The response should also include a `Retry-After` header indicating when the client can try again.

**Example:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{ "error": "Rate limit exceeded. Try again in 30 seconds." }
```

> ⚠️ **Follow-up trap:** "What other headers are typically included?" — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

### Q4. What is a Fixed Window rate limiting algorithm?

**Answer:** Fixed Window divides time into fixed intervals (e.g., every 60 seconds). Each client gets a request counter that resets at the start of every window. If the counter exceeds the limit before the window ends, further requests are blocked.

**Example:** Limit = 100 req/min. Window resets at :00, :01, :02... If a user sends 100 requests at :59, they can send another 100 at :00 — 200 requests in 2 seconds at the boundary.

> ⚠️ **Follow-up trap:** "What is the boundary burst problem?" — This is it. Two full quotas can be consumed around window edges.

---

### Q5. What is a Sliding Window rate limiting algorithm?

**Answer:** Sliding Window tracks requests in a rolling time frame relative to the current moment — not a fixed clock interval. It avoids the boundary burst problem of Fixed Window by continuously sliding the window forward in time.

**Example:** Limit = 100 req/min. At 1:00:45, the window covers 12:59:45–1:00:45. Only requests in that rolling 60s are counted.

> ⚠️ **Follow-up trap:** "What are the two variants?" — Sliding Window Log (exact, stores timestamps) and Sliding Window Counter (approximate, uses Fixed Window buckets).

---

### Q6. What is the Token Bucket algorithm?

**Answer:** A bucket holds tokens up to a max capacity. Tokens are added at a fixed rate. Each request consumes one token. If the bucket is empty, the request is rejected. This allows short bursts while enforcing an average rate over time.

**Example:** Bucket capacity = 10, refill rate = 2 tokens/sec. A user can burst 10 requests instantly, then is limited to 2 req/sec going forward.

> ⚠️ **Follow-up trap:** "How is Token Bucket different from Leaky Bucket?" — Token Bucket allows bursts; Leaky Bucket smooths output to a constant rate regardless of burst.

---

### Q7. What is the Leaky Bucket algorithm?

**Answer:** Requests enter a queue (the "bucket") and are processed at a fixed output rate, like water leaking from a hole. If the bucket is full, incoming requests are dropped. It enforces a smooth, constant request rate.

**Example:** Output rate = 5 req/sec, bucket size = 20. Even if 100 requests arrive at once, only 5/sec are forwarded. The rest wait or are dropped if the queue fills.

> ⚠️ **Follow-up trap:** "When would you prefer Leaky Bucket over Token Bucket?" — When you need strict output rate control, e.g., sending SMS or emails at a guaranteed pace.

---

### Q8. Where is rate limiting typically enforced in a system?

**Answer:** Rate limiting can be enforced at multiple layers:
- **API Gateway** — before requests reach your services (most common)
- **Reverse Proxy** — e.g., Nginx, HAProxy
- **Application layer** — inside the service itself (e.g., middleware)
- **CDN** — at the edge for DDoS protection

**Example:** In a microservices setup, an API Gateway (Kong, AWS API Gateway) rate limits globally before traffic hits any downstream service.

> ⚠️ **Follow-up trap:** "What's the problem with application-layer rate limiting in a multi-instance setup?" — Each instance has its own counter; you need a shared store like Redis for consistency.

---

### Q9. What is the difference between rate limiting per user vs per IP?

**Answer:** 
- **Per IP** — Limits requests from a single IP address. Simple but easy to bypass with multiple IPs or proxies.
- **Per user/API key** — Limits based on authenticated identity. More accurate and fair, but requires auth context.

**Example:** An unauthenticated public endpoint might rate limit by IP (100 req/min). An authenticated API limits by API key (1000 req/min for paid users, 100 for free tier).

> ⚠️ **Follow-up trap:** "What happens if many users share the same IP (e.g., office NAT)?" — Per-IP limits can unfairly block legitimate users. Prefer per-user limiting for authenticated APIs.

---

### Q10. What is the role of Redis in rate limiting?

**Answer:** Redis is used as a shared, fast, in-memory store for rate limit counters. In a distributed system with multiple app servers, all instances read/write the same Redis counter — ensuring consistent enforcement across the cluster.

**Example:** App has 5 Node.js instances. Without Redis, each has its own counter → user can make 5× the limit. With Redis, all 5 share one counter → limit is correctly enforced.

> ⚠️ **Follow-up trap:** "What Redis commands are used?" — `INCR` + `EXPIRE` for Fixed Window; `ZADD` + `ZREMRANGEBYSCORE` + `ZCARD` for Sliding Window Log.

---

### Q11. What is a rate limit "burst"?

**Answer:** A burst is a sudden spike of requests above the steady-state rate, allowed for a short period. Algorithms like Token Bucket support bursting by accumulating unused capacity as tokens. Leaky Bucket does not support bursting.

**Example:** API limit = 10 req/sec average, burst = 50. A user who hasn't made requests for 5 seconds has 50 tokens saved up and can fire 50 requests instantly.

---

### Q12. What does the `Retry-After` header tell the client?

**Answer:** It tells the client how long to wait before making another request. The value can be a number of seconds or an HTTP date. Clients should respect this header to avoid wasting quota and getting further blocked.

**Example:**
```
Retry-After: 60
```
Means: wait 60 seconds before retrying.

> ⚠️ **Follow-up trap:** "What's exponential backoff?" — A retry strategy where clients wait progressively longer between retries (1s, 2s, 4s, 8s...) to avoid hammering a recovering server.

---

### Q13. What is the difference between rate limiting and load shedding?

**Answer:** Rate limiting restricts how often a specific client can make requests. Load shedding drops requests globally when the system is under extreme load — regardless of who sent them — to keep the service alive for the majority.

**Example:** Rate limiting: "User A can only call `/search` 100 times/min." Load shedding: "We're at 95% CPU — drop 30% of all non-critical requests."

---

### Q14. Can rate limiting be applied per endpoint?

**Answer:** Yes. Different endpoints have different costs, so it's common to apply different limits per route. A `/login` endpoint might allow 5 req/min (brute force protection), while `/feed` allows 100 req/min.

**Example:**
```
/login        → 5 req/min per IP
/api/search   → 30 req/min per user
/api/export   → 2 req/min per user (expensive operation)
```

> ⚠️ **Follow-up trap:** "How do you handle this in an API Gateway vs application middleware?" — Gateway handles it via route-level policies; middleware handles it programmatically per route handler.

---

### Q15. What is the difference between hard limiting and soft limiting?

**Answer:** 
- **Hard limit** — Requests over the limit are immediately rejected with `429`.
- **Soft limit** — Requests over the limit are queued, delayed, or served at reduced priority instead of being dropped immediately.

**Example:** Hard: 101st request returns 429. Soft: 101st request waits in a queue and is processed when capacity is available — useful for batch jobs where latency is acceptable.

---

## Quick Reference Table

| Algorithm       | Burst Allowed | Memory Usage | Complexity | Best For                    |
|----------------|---------------|--------------|------------|-----------------------------|
| Fixed Window   | Yes (edge)    | Low          | Low        | Simple APIs, quick setup    |
| Sliding Window | No            | Medium–High  | Medium     | Accurate per-user limits    |
| Token Bucket   | Yes           | Low          | Medium     | APIs with burst tolerance   |
| Leaky Bucket   | No            | Low          | Medium     | Smooth output rate control  |

---

*Next: [`medium/README.md`](../medium/README.md)*