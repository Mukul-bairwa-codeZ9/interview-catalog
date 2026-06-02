# Redis Caching — Medium Interview Questions

> **Module**: Redis Caching  
> **Difficulty**: Medium  
> **Topics**: Write-Through, Write-Back, eviction policies, cache stampede, TTL vs event-based invalidation, Redis vs Memcached, paginated caching

---

## Q1: What is the difference between Cache-Aside, Write-Through, and Write-Back?

**Answer:**

These are **cache writing strategies** — they differ in *when and how* the cache and DB are kept in sync.

---

### Cache-Aside (Lazy Loading)
App checks cache → miss → reads DB → writes to cache manually.
```
READ:  App → Cache (miss) → DB → Cache (write) → App
WRITE: App → DB only (cache is NOT updated, just invalidated or TTL handles it)
```
✅ Simple, only caches what's needed  
❌ Stale data risk, cache miss penalty on first read

---

### Write-Through
Every write goes to **cache AND DB simultaneously**.
```
WRITE: App → Cache → DB (synchronous)
READ:  App → Cache (almost always a hit)
```
✅ Cache is always fresh, no stale data  
❌ Write latency increases (two writes per operation), caches data that may never be read

---

### Write-Back (Write-Behind)
Write goes to **cache first**, DB is updated **asynchronously later**.
```
WRITE: App → Cache (immediate) → DB (async, batched)
READ:  App → Cache (hit)
```
✅ Fastest writes, great for write-heavy systems  
❌ Risk of data loss if cache crashes before DB sync, complex to implement

---

**When to use which:**

| Strategy | Best For |
|----------|---------|
| Cache-Aside | Read-heavy, occasional writes (user profiles, product pages) |
| Write-Through | Read-heavy + data must stay fresh (config, session data) |
| Write-Back | Write-heavy workloads (analytics counters, IoT telemetry) |

**Follow-up you may get:** *"Which would you use for an e-commerce product page?"*
> Cache-Aside — product data is read far more than it's updated. On price change, explicitly invalidate the cache key.

---

## Q2: What are Redis eviction policies? Which would you choose and when?

**Answer:**

When Redis runs out of memory, it needs to decide which keys to remove. This is controlled by the **eviction policy**.

| Policy | What it does |
|--------|-------------|
| `noeviction` | Rejects new writes when memory is full (returns error) |
| `allkeys-lru` | Evicts **least recently used** key from ALL keys |
| `volatile-lru` | Evicts LRU key from keys **with TTL set only** |
| `allkeys-lfu` | Evicts **least frequently used** key from ALL keys |
| `volatile-lfu` | Evicts LFU key from keys with TTL only |
| `allkeys-random` | Evicts a random key from all keys |
| `volatile-random` | Evicts a random key from keys with TTL |
| `volatile-ttl` | Evicts key closest to expiry first |

---

**Choosing the right policy:**

```
Is Redis used purely as a cache (no persistent data)?
  └── YES → allkeys-lru  (safe to evict anything)

Do some keys need to stay forever (e.g., config)?
  └── YES → volatile-lru  (only evict TTL keys, protect permanent ones)

Is access pattern highly skewed (few hot keys)?
  └── YES → allkeys-lfu  (keeps frequently used keys, evicts cold ones)

Write-heavy, all keys equally important?
  └── allkeys-random  (simple, low overhead)
```

**Most common production choice:** `allkeys-lru` for pure caching, `volatile-lru` for mixed use.

**Follow-up you may get:** *"What's the difference between LRU and LFU?"*
> LRU removes the key not accessed for the longest time. LFU removes the key accessed the fewest times overall. LFU is better for workloads with stable hot data; LRU is better when recent access matters more.

---

## Q3: What is a cache stampede and how do you prevent it?

**Answer:**

A **cache stampede** (also called thundering herd) happens when a popular cached key expires and **many concurrent requests all miss the cache simultaneously** — all rushing to the DB at once.

```
TTL expires for "product:top100"
  → 500 concurrent requests all get cache miss
  → all 500 query the DB at the same time
  → DB gets overloaded
  → potential crash or timeout
```

---

**Prevention strategies:**

### 1. Mutex Lock (most common)
Only **one request** rebuilds the cache. Others wait.
```
Cache miss?
  → Try to acquire lock
  → Got lock: fetch from DB, write to cache, release lock
  → No lock: wait and retry (or serve stale data)
```
✅ Prevents DB flood  
❌ Adds latency for waiting requests

### 2. Probabilistic Early Expiry
Randomly start refreshing the cache **before** it actually expires.
```
// Simulate early expiry with some probability as TTL nears end
if (remainingTTL < threshold && Math.random() < probability) {
  refreshCache();
}
```
✅ No locks needed, smooth refresh  
❌ Harder to tune the probability

### 3. Stale-While-Revalidate
Serve the **stale (expired) data** immediately while refreshing in the background.
```
Key expired? → Serve old value now → Refresh cache async
```
✅ Zero latency for users  
❌ Users briefly see stale data

---

**Follow-up you may get:** *"Which strategy would you use in production?"*
> Stale-while-revalidate for user-facing reads where slight staleness is acceptable. Mutex lock for financial or inventory data where accuracy matters more.

---

## Q4: How does TTL-based invalidation differ from event-based invalidation?

**Answer:**

**Cache invalidation** = deciding when to remove or update a cached value. Two main approaches:

---

### TTL-Based Invalidation
Cache entry expires automatically after a fixed time.
```
SET product:123 "{...}" EX 300   ← auto-deletes after 5 minutes
```
✅ Simple, no extra infrastructure  
✅ Works well when slight staleness is acceptable  
❌ Data can be stale for up to TTL duration  
❌ Can't react immediately to data changes

**Best for:** Product listings, news feeds, public dashboards

---

### Event-Based Invalidation
Cache is explicitly invalidated when a specific event occurs (e.g., DB update).
```
User updates profile
  → App writes to DB
  → App deletes/updates Redis key: DEL user:123
  → Next request gets fresh data from DB
```
✅ Always fresh — cache updates in real-time  
✅ No stale data window  
❌ More complex — every write path must also update the cache  
❌ Risk of cache-DB inconsistency if the invalidation step fails

**Best for:** User account data, inventory counts, pricing

---

**Hybrid approach (most production systems):**
Use event-based invalidation as the primary mechanism + TTL as a safety net fallback.
```
DEL user:123             ← event-driven, on every update
SET user:123 EX 3600     ← TTL as backup if event-based miss happens
```

**Follow-up you may get:** *"What can go wrong with event-based invalidation?"*
> Race condition: DB write succeeds but cache invalidation fails → stale cache. Solution: use transactions or an outbox pattern to guarantee both happen.

---

## Q5: Redis vs Memcached — how do you choose?

**Answer:**

Both are in-memory caches. Choose based on your needs:

| Feature | Redis | Memcached |
|---------|-------|-----------|
| Data structures | Rich (strings, hashes, sets, sorted sets, lists) | Strings only |
| Persistence | Yes (RDB + AOF) | No |
| Pub/Sub | Yes | No |
| Clustering | Yes (Redis Cluster) | Yes (client-side sharding) |
| Lua scripting | Yes | No |
| Atomic operations | Yes | Limited |
| Memory efficiency | Slightly higher overhead | More memory-efficient for plain strings |
| Multithreading | Single-threaded (I/O multiplexing) | Multi-threaded |

---

**Decision framework:**

```
Need more than key-value strings?           → Redis
Need persistence or durability?             → Redis
Need pub/sub or real-time features?         → Redis
Pure simple string caching at massive scale
  + want multi-threaded performance?        → Memcached
```

**Honest answer for most interviews:** *"In almost all modern systems I'd choose Redis — it's a superset of Memcached's functionality. Memcached is only worth it if you need raw multi-threaded throughput for simple string caching at extreme scale."*

**Follow-up you may get:** *"Is Redis single-threaded?"*
> The main command execution is single-threaded (which avoids race conditions), but I/O and background tasks are multi-threaded since Redis 6.0. In practice, Redis handles millions of ops/sec on a single core.

---

## Q6: How would you cache a paginated API response?

**Answer:**

Pagination caching is tricky because the cache key must uniquely identify the page state.

**Strategy 1: Cache per page**
```
Key: products:page:2:limit:20:sort:price_asc
Value: JSON array of 20 products
TTL: 5 minutes
```
✅ Simple, works well for stable data  
❌ Cache explodes in size across many page/filter combinations  
❌ If any product on page 2 changes, entire page cache is stale

---

**Strategy 2: Cache individual items, assemble pages on read**
```
Cache each product: product:123 → {...}
On page request: fetch IDs from DB (fast index query) → get each from Redis
```
✅ Granular invalidation — only invalidate the changed item  
✅ Items are reused across different pages/filters  
❌ More Redis round-trips per request (use pipelining to batch)

---

**Strategy 3: Cursor-based caching (for infinite scroll)**
```
Key: feed:user:456:cursor:abc123
Value: next batch of posts
TTL: 2 minutes
```
✅ Works well for feeds with stable ordering  
❌ Invalidation is hard if feed items change

---

**Production recommendation:**
- Use **Strategy 2** (cache individual entities) for data that changes often
- Use **Strategy 1** (cache full pages) for mostly-static data like product catalogs
- Always include **sort + filter params in the key** to avoid serving wrong data

**Follow-up you may get:** *"How do you handle cache invalidation when a paginated item is updated?"*
> With Strategy 2, just invalidate the single item's key. The next page assembly will pick up the fresh value. With Strategy 1, you'd need to invalidate all pages or use a version tag in the key.

---

## 🗣️ Interview Answer Template

For medium-difficulty caching questions, use this structure:

```
1. DEFINE THE PROBLEM  — What challenge does this solve?
2. EXPLAIN THE MECHANISM — How does it work? (use a simple flow diagram in words)
3. PROS & CONS          — What are the tradeoffs?
4. COMPARE              — How does it differ from alternatives?
5. PRODUCTION EXAMPLE   — When would you actually use it?
```

**Example for "How do you prevent cache stampede?":**
> "Cache stampede happens when a popular key expires and many concurrent requests all miss and hammer the DB. The three main solutions are: mutex lock (only one request rebuilds, others wait), probabilistic early expiry (start refreshing before TTL expires), and stale-while-revalidate (serve old data instantly, refresh in background). In production I'd use stale-while-revalidate for user-facing reads since zero latency matters more than perfect freshness. For inventory or pricing I'd use a mutex lock to prevent serving wrong data."

---

*Next: [`advanced.md`](./advanced.md) — Cache stampede deep dive, distributed cache consistency, hot key problem, cache warming*