# Caching Strategies

A caching strategy defines **how your application reads from and writes to the cache** relative to the database. Picking the wrong strategy causes stale data, cache misses, or data loss.

---
 
## 1. Cache-Aside (Lazy Loading)

### What it is
The application is responsible for managing the cache. **The cache sits beside the DB** — the app checks cache first, and only loads from DB on a miss.

### How it works
1. App receives a read request.
2. Check cache → **HIT**: return data. Done.
3. **MISS**: fetch from DB, write result into cache, return to client.
4. Writes go **directly to DB** — cache is NOT updated on write (it expires/invalidates naturally).

### When to use it
- Read-heavy workloads (user profiles, product pages, config data).
- When you can tolerate slightly stale data.
- Most common pattern — Redis + any DB.

### Interview Q&A

**Q: What is cache-aside and why is it the most common strategy?**
> The app checks the cache first. On a miss it loads from the DB and populates the cache. It's popular because it's simple, only caches what's actually requested, and the cache can fail without breaking reads (app falls back to DB).

**Q: What's the main risk of cache-aside?**
> **Cache stampede** — if many requests miss at the same time (cold start or TTL expiry), all of them hit the DB simultaneously. Also, data can be stale between a DB write and the cache TTL expiring.

**Q: How do you handle a cold cache with cache-aside?**
> Cache warming — pre-populate the cache on startup with frequently accessed data before traffic hits, so you don't get a stampede on first load.

---

## 2. Read-Through

### What it is
The **cache itself fetches from the DB** on a miss — the app only ever talks to the cache. The cache library or a cache proxy handles DB reads transparently.

### How it works
1. App requests data from cache.
2. **HIT**: cache returns data.
3. **MISS**: cache automatically queries the DB, stores the result, returns it to app.
4. App never directly touches the DB for reads.

### When to use it
- When you want to keep DB access logic out of your application code.
- Works well with cache libraries that support it natively (e.g. AWS ElastiCache with DAX for DynamoDB).

### Interview Q&A

**Q: How is read-through different from cache-aside?**
> In cache-aside the **app** fetches from DB on a miss and updates the cache. In read-through the **cache** fetches from DB automatically. The app always only talks to the cache layer.

**Q: What's a downside of read-through?**
> First request for any key is always a cache miss (cold start). Also, the cache must have a DB connector/adapter built in, which adds coupling and complexity vs the simplicity of cache-aside.

**Q: When would you choose read-through over cache-aside?**
> When you want a cleaner separation — app code stays simple and never calls the DB directly for reads. Common in managed caching solutions where the cache layer handles DB integration for you.

---

## 3. Write-Through

### What it is
**Every write goes to the cache AND the DB synchronously** — both are always in sync. The app writes to the cache, and the cache immediately writes to the DB before returning success.

### How it works
1. App writes data to cache.
2. Cache **synchronously** writes to DB.
3. Both cache and DB are updated. Write completes.
4. Reads always hit a warm, consistent cache.

### When to use it
- Paired with read-through (they complement each other perfectly).
- When consistency between cache and DB is critical.
- Financial data, inventory counts, user account balances.

### Interview Q&A

**Q: What is write-through caching?**
> Every write updates both the cache and the DB in the same operation. This keeps cache and DB always in sync, so reads are always fresh. The tradeoff is higher write latency since you're writing to two places synchronously.

**Q: What's the main downside of write-through?**
> Write latency increases because every write must complete in both cache and DB. Also, you may cache data that's never read — wasting memory on write-heavy data that's rarely queried.

**Q: How does write-through solve the stale data problem of cache-aside?**
> Cache-aside only updates the cache on reads (lazy). Write-through updates the cache on every write, so reads always see fresh data. No TTL-based staleness window.

---

## 4. Write-Behind (Write-Back)

### What it is
Writes go to the **cache first**, and the DB is updated **asynchronously later** in the background. The app gets fast write acknowledgement immediately.

### How it works
1. App writes to cache → immediately returns success to client.
2. Cache queues the write.
3. Background process flushes the write to DB asynchronously (batched or after a delay).

### When to use it
- Write-heavy workloads where low write latency matters more than immediate DB consistency.
- Analytics counters, activity logs, shopping cart updates, view counts.
- Acceptable risk: if cache crashes before flush, writes are lost.

### Interview Q&A

**Q: What is write-behind caching and how is it different from write-through?**
> Write-through writes to cache AND DB synchronously — slower but consistent. Write-behind writes to cache only and flushes to DB asynchronously — faster but risks data loss if the cache goes down before the flush.

**Q: What's the biggest risk of write-behind?**
> **Data loss**. If the cache node crashes before the background flush completes, unsynced writes are permanently lost. You need persistence (Redis AOF/RDB) or a durable queue to mitigate this.

**Q: When would you use write-behind over write-through?**
> When write throughput is the priority and you can tolerate eventual consistency or small data loss risk. Examples: incrementing view counters, logging user events, updating "last seen" timestamps — losing a few writes is acceptable.

---

## Comparison Table

| Strategy | Who loads on miss | Who writes to DB | Consistency | Write Speed | Complexity |
|---|---|---|---|---|---|
| **Cache-Aside** | App | App (directly) | Eventual | Fast | Low |
| **Read-Through** | Cache | App (directly) | Eventual | Fast | Medium |
| **Write-Through** | Cache | Cache (sync) | Strong | Slower | Medium |
| **Write-Behind** | Cache | Cache (async) | Eventual | Fastest | High |

### Quick decision guide
- **Default / simple?** → Cache-Aside
- **Clean app code, managed cache?** → Read-Through + Write-Through together
- **Consistency critical?** → Write-Through
- **Max write speed, tolerate some loss?** → Write-Behind