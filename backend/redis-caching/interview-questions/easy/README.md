# Redis Caching — Easy Interview Questions

> **Module**: Redis Caching  
> **Difficulty**: Easy  
> **Topics**: Caching basics, Cache-Aside, TTL, Redis data structures, cache hit/miss

---

## Q1: What is caching and why do we use it?

**Answer:**

Caching is storing frequently accessed data in a fast, temporary storage layer so future requests can be served faster — without hitting the original, slower data source (like a database or external API).

**Why we use it:**
- Reduce database load
- Lower response latency (memory reads are ~100x faster than disk)
- Handle high traffic without scaling the DB

**Real example:** Instead of querying the DB on every `/user/:id` request, store the result in Redis with a key like `user:123`. Serve from Redis until TTL expires.

**Follow-up you may get:** *"What are the tradeoffs of caching?"*
> Stale data, cache invalidation complexity, extra infrastructure to manage.

---

## Q2: What is the Cache-Aside (Lazy Loading) pattern?

**Answer:**

Cache-Aside means the **application** is responsible for loading data into the cache. The cache does not talk to the database directly.

**Flow:**
1. App checks cache → **cache hit** → return data
2. **Cache miss** → app fetches from DB → stores result in cache → returns data

```
Request → Check Redis
            ├── HIT  → return cached data
            └── MISS → query DB → write to Redis → return data
```

**Why it's called "Lazy":** Data is only loaded into cache when it's first requested — not upfront.

**Pros:**
- Only caches data that's actually needed
- Cache failure doesn't break the app (falls back to DB)

**Cons:**
- First request is always slow (cache miss penalty)
- Data can become stale if DB is updated without invalidating cache

**Follow-up you may get:** *"How do you handle stale data in Cache-Aside?"*
> Set an appropriate TTL, or explicitly delete/update the cache key on DB writes.

---

## Q3: What is a cache hit and a cache miss?

**Answer:**

| Term | Meaning |
|------|---------|
| **Cache Hit** | Requested data is found in cache → fast response |
| **Cache Miss** | Data is NOT in cache → must fetch from DB → slower |

**Hit Rate** = (Cache Hits / Total Requests) × 100

A healthy cache hit rate is typically **90%+**. Below 80% means the cache isn't helping much.

**Why interviewers ask this:** They want to know you understand the performance impact of caching decisions — TTL too short = more misses, wrong keys cached = low hit rate.

**Follow-up you may get:** *"How would you improve a low cache hit rate?"*
> Increase TTL, pre-warm cache on startup, cache at a higher level (e.g., full response vs. individual DB row).

---

## Q4: What is TTL in caching?

**Answer:**

TTL (Time-To-Live) is the duration a cached item stays valid before it's automatically deleted.

```
SET user:123 "{name: 'Mukul'}" EX 3600   ← expires in 3600 seconds (1 hour)
```

**Why TTL matters:**
- Prevents serving stale data indefinitely
- Automatically frees memory
- Acts as a built-in cache invalidation mechanism

**Choosing TTL:**

| Data Type | Suggested TTL |
|-----------|--------------|
| User session | 15–30 min |
| Product listing | 5–10 min |
| Static config | 1–24 hours |
| Real-time stock price | 1–5 sec |

**Tradeoff:** Short TTL = fresher data but more DB load. Long TTL = fewer DB hits but stale data risk.

**Follow-up you may get:** *"What happens when TTL expires for many keys at the same time?"*
> Cache stampede — covered in the advanced section.

---

## Q5: What are the main Redis data structures?

**Answer:**

Redis is not just a key-value store — it supports rich data types:

| Data Structure | Use Case | Example Command |
|----------------|----------|-----------------|
| **String** | Simple cache values, counters | `SET user:1 "Mukul"` |
| **Hash** | Store object fields (like a row) | `HSET user:1 name "Mukul" age 25` |
| **List** | Queues, recent activity feeds | `LPUSH feed:1 "post_99"` |
| **Set** | Unique items, tags, followers | `SADD tags:post1 "nodejs" "redis"` |
| **Sorted Set (ZSet)** | Leaderboards, ranked data | `ZADD leaderboard 1500 "mukul"` |
| **Bitmap** | Feature flags, daily active users | `SETBIT active:2024-01-01 userId 1` |

**Interview tip:** Don't just list these — say *when* you'd use each. "I'd use a Sorted Set for a leaderboard because it keeps items ranked by score automatically."

**Follow-up you may get:** *"When would you use a Hash over a String?"*
> Use Hash when you want to update individual fields without reserializing the whole object.

---

## Q6: What is the difference between Redis and a traditional database?

**Answer:**

| | Redis | Traditional DB (e.g., PostgreSQL) |
|--|-------|----------------------------------|
| **Storage** | In-memory (RAM) | Disk-based |
| **Speed** | Sub-millisecond reads | Milliseconds to seconds |
| **Persistence** | Optional (RDB/AOF) | Always persisted |
| **Data size** | Limited by RAM | Essentially unlimited |
| **Query power** | Key-based lookups | Full SQL — joins, aggregations |
| **Primary use** | Cache, sessions, pub/sub | Source of truth |

**Key point for interviews:** Redis is NOT a replacement for a database — it's a complement. The DB is your source of truth; Redis is your fast-access layer.

**Follow-up you may get:** *"Can Redis be used as a primary database?"*
> Yes, with persistence enabled (AOF/RDB), but it's rare due to RAM cost and limited querying ability.

---

## Q7: When should you NOT use a cache?

**Answer:**

Caching isn't always the right answer. Avoid it when:

1. **Data changes very frequently** — cache becomes stale almost immediately (e.g., live auction bids)
2. **Data is highly personalized** — caching per-user data can explode memory usage
3. **Strong consistency is required** — financial transactions, inventory counts (stale reads = bugs)
4. **Data set is too large** — caching everything isn't feasible; you need a smart eviction strategy
5. **Low traffic** — if the DB can handle it, caching adds complexity for no gain

**Interview tip:** This is a "senior mindset" question. Knowing *when not* to use a tool shows judgment, not just knowledge.

**Follow-up you may get:** *"How do you decide what to cache?"*
> Cache data that is: read-heavy, expensive to compute/fetch, and tolerates some staleness.

---

## 🗣️ Interview Answer Template

When asked any caching question, structure your answer like this:

```
1. DEFINE   — What is it? (1 sentence)
2. HOW      — How does it work? (brief flow or example)
3. WHY      — Why do we use it / what problem does it solve?
4. TRADEOFF — What's the downside or when would you NOT use it?
5. EXAMPLE  — Real-world scenario where you'd apply it
```

**Example for "What is Cache-Aside?":**
> "Cache-Aside is a pattern where the application checks the cache first, and on a miss, fetches from the DB and populates the cache itself. It's lazy — data only enters the cache when requested. The benefit is we only cache what's needed, but the first request always takes a DB hit. I'd use this for user profile data — it's read-heavy but doesn't need real-time accuracy."

---

*Next: [`medium.md`](./medium.md) — Write-Through vs Write-Back, eviction policies, cache stampede*