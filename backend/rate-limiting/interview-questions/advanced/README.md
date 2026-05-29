# Rate Limiting — Advanced Interview Questions

> **Target:** Senior/System Design level. Covers rate limiter architecture, CAP theorem tradeoffs, Redis HA, failure modes, and production edge cases.
> **Format:** Core answer + example + follow-up trap (where applicable).

---

### Q1. Design a rate limiter as a standalone service. What does the architecture look like?

**Answer:** A rate limiter service sits between clients and your backend — typically as a sidecar, middleware layer, or dedicated microservice. Core components:

1. **Rule Store** — DB/config service holding per-tenant, per-endpoint limits
2. **Counter Store** — Redis cluster for fast atomic counters
3. **Rate Limiter Service** — stateless nodes that evaluate rules + query Redis
4. **Admin API** — to manage rules dynamically without redeployment
5. **Metrics/Alerting** — track limit hits, reject rates, Redis latency

```
Client → API Gateway → Rate Limiter Service → Backend Services
                              ↓         ↑
                         Redis Cluster  Rule Store (DB)
```

**Example:** Cloudflare's rate limiter, Kong's rate-limit plugin, and AWS API Gateway rate limiting all follow this pattern — stateless evaluator nodes backed by a fast shared store.

> ⚠️ **Follow-up trap:** "How do you make the Rate Limiter Service itself highly available?" — Deploy multiple stateless instances behind a load balancer. All share the same Redis cluster — no instance holds local state.

---

### Q2. How does CAP theorem apply to a distributed rate limiter?

**Answer:** A distributed rate limiter using Redis must choose between **Consistency** and **Availability** during a network partition:

- **CP (Consistent)** — Reject requests if Redis is unreachable. Guarantees exact limits but causes outages if Redis partitions.
- **AP (Available)** — Allow requests through if Redis is unreachable (fail open). No outage, but limits may be violated temporarily.

Most production systems choose **AP** — a brief period of unenforced limits is safer than taking down the entire API.

**Example:** Stripe's API rate limiter fails open during Redis incidents with monitoring alerts, rather than rejecting all customer traffic. Enforcement resumes once Redis recovers.

> ⚠️ **Follow-up trap:** "Is there a middle ground?" — Yes. Use local in-memory counters as fallback during Redis outages. Approximate enforcement with no external dependency. Sync back when Redis recovers (best-effort).

---

### Q3. What happens to your rate limiter when Redis goes down? How do you handle it?

**Answer:** Three strategies, each with a tradeoff:

| Strategy | Behavior | Risk |
|---|---|---|
| **Fail open** | Allow all requests | Abuse possible during outage |
| **Fail closed** | Reject all requests | Service outage for all users |
| **Local fallback** | Use in-memory counter per instance | Over-allows by factor of N instances |

**Recommended production approach:**
1. Fail open with **circuit breaker** — stop querying Redis once failure threshold is hit
2. Switch to **in-memory counters** per instance (approximate enforcement)
3. **Alert immediately** — PagerDuty / Slack on Redis unavailability
4. **Resume Redis** enforcement once recovered — don't carry over stale local counts

**Example:** Netflix's Hystrix (now resilience4j) pattern — circuit breaker trips after X failures, fallback logic activates, metrics fire, Redis queries resume after health check passes.

> ⚠️ **Follow-up trap:** "How do you prevent the thundering herd when Redis recovers?" — Add jitter to the reconnect interval so all instances don't hammer Redis simultaneously on recovery.

---

### Q4. How would you design a rate limiter that works across multiple data centers?

**Answer:** Cross-DC rate limiting is a hard consistency problem. Options:

1. **Per-DC limits** — Each DC enforces its own limit (e.g., 100 req/min per DC). Simple but allows N× global requests across N DCs. Acceptable if DCs serve different regions.

2. **Global Redis with replication** — Single Redis cluster (with replicas) serves all DCs. Strong consistency, but cross-DC latency adds overhead to every request.

3. **Async gossip / sync** — Each DC has a local Redis. Counters are synced asynchronously across DCs. Approximate global enforcement with local latency.

4. **Token Bucket with async refill** — Tokens allocated globally, distributed to local buckets per DC periodically. Fast locally, slightly stale globally.

**Example:** Figma and Discord use per-region rate limits with a global hard cap enforced asynchronously — local Redis for speed, global sync for abuse prevention.

> ⚠️ **Follow-up trap:** "What's the minimum latency cost of strong cross-DC consistency?" — Speed of light between DCs (e.g., US East ↔ US West ≈ 60–80ms). For sub-10ms APIs, this is unacceptable — async/approximate is the only viable option.

---

### Q5. How do you rate limit streaming or WebSocket connections?

**Answer:** HTTP rate limiting counts discrete requests. Streaming connections are long-lived — the connection itself isn't the unit to limit. Instead, rate limit:

- **Connection establishment** — limit how many connections a user can open (e.g., 5 concurrent WebSocket connections)
- **Message rate** — limit messages per second within an active connection
- **Data volume** — limit bytes transferred per minute (for video/audio streams)

**Example:**
```
WebSocket connection open → check connection count in Redis → allow/reject
Per message → INCR message counter per connection → allow/drop if > 100 msg/sec
```

Token Bucket works well here — each incoming message consumes a token; bucket refills at allowed message rate.

> ⚠️ **Follow-up trap:** "How do you handle backpressure instead of dropping messages?" — Instead of rejecting, pause reading from the socket buffer (backpressure). The client naturally slows down. Used in gRPC flow control and Kafka consumers.

---

### Q6. What is the "thundering herd" problem in rate limiting and how do you mitigate it?

**Answer:** When a rate limit window resets (e.g., at :00 every minute), all clients who were blocked simultaneously retry — causing a massive spike right at the reset boundary. This can overwhelm the backend even within the allowed quota.

**Mitigations:**
1. **Jitter on retry** — clients wait a random delay after `Retry-After` instead of retrying exactly at reset time
2. **Sliding window** — no hard reset boundary, so no synchronized retry spike
3. **Queue-based smoothing** — buffer requests and release them at a controlled rate (Leaky Bucket)
4. **Staggered window starts** — per-user window starts at first request time, not a global clock tick

**Example:** AWS SDK's retry logic adds exponential backoff + jitter by default, specifically to avoid synchronized retries causing thundering herd on rate-limited endpoints.

> ⚠️ **Follow-up trap:** "Does Sliding Window fully eliminate this?" — It eliminates the hard reset spike, but a sudden burst of requests near the window tail can still cause a mini-herd. Token Bucket with burst control handles this better.

---

### Q7. How do you rate limit at the database layer to protect downstream services?

**Answer:** API-layer rate limiting protects your service from clients. But a single API request can trigger N database queries — an attacker staying under API limits can still hammer your DB with complex queries.

**Strategies:**
1. **Query rate limiting** — limit queries per second per user at the ORM/connection pool layer
2. **Connection pool caps** — limit max DB connections per service instance (PgBouncer, HikariCP)
3. **Query cost limiting** — assign a "cost" to queries based on complexity; reject if cost exceeds budget (used in GraphQL)
4. **Read replica routing** — offload reads to replicas, protecting the primary

**Example:** GitHub's GraphQL API uses a **point system** — each field/resolver costs points. A query's total cost is calculated before execution. If it exceeds the budget (5000 points), it's rejected before hitting the DB.

> ⚠️ **Follow-up trap:** "How do you calculate query cost before execution?" — Static analysis of the query AST. For GraphQL, each field has a configured cost; nested/paginated fields multiply cost. Rejected before any DB round-trip.

---

### Q8. A production rate limiter is rejecting legitimate users. How do you debug it?

**Answer:** Systematic approach:

1. **Check the rate limit key** — is it scoped correctly? (per-IP when it should be per-user? shared key collision?)
2. **Check Redis counter value** — `GET rate:user123:...` — is it actually over limit or a bug?
3. **Check clock skew** — if window keys use timestamps, are all instances in sync? Use NTP / Redis server time (`TIME` command) instead of local clock.
4. **Check key expiry** — is `EXPIRE` being set correctly? A key without TTL never resets.
5. **Check shared IP problem** — multiple users on same IP hitting per-IP limit
6. **Check algorithm edge case** — Fixed Window boundary burst being misread as abuse

**Example:** A bug where `EXPIRE` was only set on key creation (NX) but Redis evicted the key under memory pressure — on recreation, EXPIRE was skipped, making the counter permanent. Fixed by always checking TTL and resetting if -1.

> ⚠️ **Follow-up trap:** "How do you expose observability for rate limiting?" — Emit metrics: `rate_limit.checked`, `rate_limit.rejected`, `rate_limit.remaining` with labels for user, endpoint, algorithm. Dashboard in Grafana/Datadog. Alert on rejection rate spikes.

---

### Q9. How does Cloudflare or an edge CDN handle rate limiting at scale?

**Answer:** At CDN scale (millions of req/sec), centralized Redis is a bottleneck. Edge rate limiting uses:

1. **Local counters per PoP** — each Point of Presence enforces limits independently using in-memory counters. Fast, no cross-DC calls.
2. **Approximate global sync** — counters are gossiped across PoPs asynchronously. Global view is eventually consistent.
3. **CRDTs (Conflict-free Replicated Data Types)** — counters that can be merged across nodes without coordination, guaranteeing eventual consistency without locks.
4. **Challenge-based limiting** — instead of hard blocking, serve a JS challenge or CAPTCHA to suspected abusers (Cloudflare's "I'm Under Attack" mode).

**Example:** Cloudflare rate limiting uses local in-memory counters at each PoP with async propagation. A request burst from one region is caught locally within milliseconds; global view converges within seconds.

> ⚠️ **Follow-up trap:** "What's a CRDT counter?" — A G-Counter (Grow-only Counter) that can be incremented locally and merged across nodes by taking the max per node. No coordination needed. Eventually consistent global sum. Used by Redis (with Riak heritage) and Cassandra counters.

---

### Q10. How do you handle rate limiting for batch or bulk API endpoints?

**Answer:** A single bulk request (e.g., `POST /messages/batch` with 1000 messages) should not count as 1 request — it costs as much as 1000 individual requests. Rate limit on **resource units consumed**, not request count.

**Strategies:**
1. **Cost-based limiting** — each request has a cost = number of items in the batch. Deduct cost from the bucket.
2. **Pre-flight check** — before processing, check if remaining quota covers the batch size. Reject if not.
3. **Partial processing** — process up to the remaining quota, return partial results with `206 Partial Content` and `X-RateLimit-Remaining: 0`.

**Example:**
```
User quota: 1000 units/min. Remaining: 200.
POST /batch with 500 items → cost = 500.
Option A: Reject entire batch (429).
Option B: Process 200 items, return partial result, reset quota.
```

Stripe's batch API deducts per-object, not per-request. Sending 100 objects costs 100 units.

> ⚠️ **Follow-up trap:** "How do you communicate cost to the client upfront?" — `X-RateLimit-Cost: 500` header in the response, or a dry-run endpoint that returns the estimated cost without executing.

---

### Q11. What are the real-world failure modes of a Redis-backed rate limiter in production?

**Answer:** Common production failure modes and their fixes:

| Failure Mode | Cause | Fix |
|---|---|---|
| **Hot key problem** | One user key gets millions of hits/sec, overloading a single Redis shard | Shard keys across multiple Redis nodes; use Redis Cluster |
| **Clock skew** | App servers have different system times → wrong window keys | Use Redis `TIME` command for canonical timestamp |
| **Key without TTL** | `EXPIRE` missed due to bug → counter never resets → permanent block | Monitor for keys with `TTL = -1`; add TTL health checks |
| **Memory exhaustion** | Sliding Window Log ZSETs grow unbounded for active users | Set `ZREMRANGEBYSCORE` on every read; cap ZSET size |
| **Redis eviction** | `maxmemory-policy allkeys-lru` evicts rate limit keys under pressure | Use a dedicated Redis instance for rate limiting with `noeviction` policy |
| **Lua script timeout** | Complex Lua script blocks Redis > 5 seconds → all operations stall | Keep Lua scripts simple; set `lua-time-limit`; monitor slow log |

> ⚠️ **Follow-up trap:** "How do you handle the hot key problem without Redis Cluster?" — Client-side sharding: hash the user key to one of N Redis instances. Or use local caching with async Redis sync to reduce per-key hit rate.

---

### Q12. How would you design rate limiting for a GraphQL API differently from REST?

**Answer:** REST endpoints map 1:1 to resources — rate limiting per endpoint is straightforward. GraphQL has a single `/graphql` endpoint but queries vary wildly in complexity.

**REST approach doesn't work because:**
- A simple `{ user { name } }` and a deeply nested `{ users { posts { comments { likes { author } } } } }` both hit `POST /graphql`
- Per-request counting treats them equally — unfair and dangerous

**GraphQL-specific strategies:**
1. **Query depth limiting** — reject queries beyond a max depth (e.g., 5 levels)
2. **Query complexity / cost analysis** — assign costs to fields, calculate total before execution, reject if over budget
3. **Persisted queries** — only allow pre-registered, pre-analyzed queries in production
4. **Field-level rate limiting** — expensive resolvers (e.g., `search`, `export`) get their own limits

**Example:**
```
{ user { posts { comments { likes { author { followers } } } } } }
Depth = 6 → rejected (max depth = 5)

Cost: user=1, posts=2, comments=5, likes=10, author=1, followers=3 → total=22
Budget = 20 → rejected before execution
```

> ⚠️ **Follow-up trap:** "How do you calculate cost for paginated fields?" — Multiply field cost by the `first`/`limit` argument. `posts(first: 100)` costs 100× a single post. Limits unbounded pagination abuse.

---

## Quick Reference — Advanced Concepts

| Topic | Key Insight |
|---|---|
| Rate limiter as a service | Stateless evaluator nodes + Redis cluster + Rule store |
| CAP theorem | Choose AP (fail open) in most production systems |
| Redis failure | Fail open + local fallback + circuit breaker + alert |
| Cross-DC limiting | Per-DC limits or async gossip — strong consistency too costly |
| WebSocket limiting | Limit connections + message rate + data volume |
| Thundering herd | Jitter on retry + Sliding Window + staggered resets |
| DB layer protection | Query cost limits + connection pool caps |
| Edge/CDN scale | Local PoP counters + async gossip + CRDTs |
| Batch APIs | Cost-based limiting (units consumed, not request count) |
| Production failures | Hot key, clock skew, missing TTL, memory eviction, Lua timeout |
| GraphQL | Depth limit + complexity budget + persisted queries |

---

*Previous: [`medium/README.md`](../medium/README.md)*