# What is Caching?

## Simple Definition

> **Caching is storing frequently accessed data in a fast, temporary storage layer so future requests are served faster — without hitting the original (slower) source.**

Think of it like this:
- **Database** = library (slow, far away, needs a librarian)
- **Cache** = your personal bookshelf (fast, right next to you)
- You grab the book from your shelf first. Only go to the library if it's not there.

---

## Why Caching Exists — The Core Problem

Every application has a **slow layer** (database, external API, disk I/O) and a **fast layer** (memory, CPU cache).

```
Without Cache:
User Request → App Server → Database (20–200ms) → Response

With Cache:
User Request → App Server → Cache Hit (1–5ms) → Response
                                ↓ (on miss only)
                            Database (20–200ms)
```

The goal is to **maximize cache hits** and **minimize database load**.

---

## Key Terminology (Interview-Ready)

| Term | Meaning |
|---|---|
| **Cache Hit** | Data found in cache — fast path |
| **Cache Miss** | Data NOT in cache — fallback to DB |
| **Hit Rate** | `hits / (hits + misses)` — higher is better |
| **TTL (Time To Live)** | How long data stays in cache before expiring |
| **Eviction** | Removing old/less-used data when cache is full |
| **Cold Cache** | Cache is empty (e.g., after a server restart) |
| **Warm Cache** | Cache is populated with useful data |
| **Cache Stampede** | Many requests hit DB at once on a cache miss | 
| **Stale Data** | Cached data that is outdated compared to DB |

---

## Where is Cache Stored?

### 1. In-Memory (fastest)
- **RAM** on the app server itself (`node-cache`, local Map)
- Pros: Ultra-fast (nanoseconds)
- Cons: Lost on restart, not shared across servers

### 2. Distributed Cache (most common in production)
- **Redis**, **Memcached**
- Pros: Shared across all app servers, persistent options
- Cons: Network hop adds ~1ms latency

### 3. CDN Cache (for static assets)
- **Cloudflare, AWS CloudFront**
- Caches HTML, CSS, images at the edge (close to users)

### 4. Browser Cache
- Stores assets in user's browser
- Controlled via `Cache-Control` HTTP headers

---

## Redis as a Cache — Why It's the Industry Standard

Redis (Remote Dictionary Server) is the most popular caching solution because:

- **In-memory** → microsecond read/write
- **Rich data structures** → Strings, Hashes, Lists, Sets, Sorted Sets
- **TTL support** → auto-expiry built in
- **Persistence options** → RDB snapshots, AOF logging
- **Atomic operations** → safe for counters, locks
- **Pub/Sub** → real-time messaging
- **Cluster mode** → horizontal scalability

```
App Server 1 ──┐
App Server 2 ──┤──→ Redis (shared cache) ──→ PostgreSQL (DB)
App Server 3 ──┘
```

---

## Cache Hit Rate — What's Good?

| Hit Rate | Assessment |
|---|---|
| < 50% | Poor — cache isn't helping much |
| 50–80% | Acceptable |
| 80–95% | Good |
| > 95% | Excellent — well-tuned cache |

Formula:
```
Hit Rate = Cache Hits / (Cache Hits + Cache Misses) × 100
```

---

## Interview Q&A

### ❓ Q1: What is caching and why do we use it?
**A:** Caching stores frequently accessed data in fast temporary storage (like Redis in memory) so we avoid repeated expensive operations like database queries. It reduces latency from ~100ms to ~1ms and reduces load on the database, allowing the system to scale better.

---

### ❓ Q2: What is a cache hit vs cache miss?
**A:** A cache hit is when the requested data is found in the cache — we return it immediately. A cache miss is when it's not there — we fetch it from the database, return it to the user, and usually store it in cache for next time. Hit rate = hits / (hits + misses). A well-tuned cache should have >80% hit rate.

---

### ❓ Q3: What are the tradeoffs of caching?
**A:**
- **Pro:** Lower latency, less DB load, better scalability
- **Con:** Stale data risk (cache and DB can go out of sync), added complexity, memory cost, cold start problem (cache is empty after restart)

---

### ❓ Q4: What is a cache stampede and how do you prevent it?
**A:** A cache stampede (also called thundering herd) happens when a popular cache key expires and suddenly hundreds of requests all go to the database at the same time to refill it. Prevention strategies:
1. **Locking** — only one request rebuilds the cache; others wait
2. **Probabilistic early expiry** — refresh the cache slightly before it expires
3. **Background refresh** — a separate job refreshes cache before TTL expires
4. **Jitter** — add randomness to TTL so keys don't expire all at once

---

### ❓ Q5: When would you NOT use a cache?
**A:**
- When data changes very frequently (stale data risk outweighs benefit)
- When data is user-specific and rarely repeated (low hit rate)
- When consistency is critical and you can't tolerate stale reads
- For very small datasets that are already fast to query

---

### ❓ Q6: What is TTL in caching?
**A:** TTL (Time To Live) is the duration after which a cached entry automatically expires and is removed. It ensures data doesn't stay stale indefinitely. Setting TTL too low = frequent cache misses. Too high = stale data risk. The right TTL depends on how often the underlying data changes.

---

## One-Line Summary for Interviews

> *"Caching sits between your application and your database, serving hot data from memory to reduce latency and database load — Redis is the industry standard for distributed caching."*