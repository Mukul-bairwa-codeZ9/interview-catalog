# Cache Invalidation

## Why It's Hard

> "There are only two hard things in Computer Science: cache invalidation and naming things."
> — Phil Karlton

Cache invalidation is the problem of **knowing when cached data is stale and removing or updating it**. The challenge: your cache and DB are two separate systems. Any time the DB changes, the cache may now hold outdated data — and you need a strategy to handle that.

Get it wrong → users see stale data.
Over-invalidate → you lose all the performance benefits of caching.

---

## The Core Problem

1. You cache a user's profile: `user:42 → { name: "Alice", plan: "free" }`
2. Alice upgrades to "pro" → DB is updated.
3. Cache still says "free" → Alice can't access pro features.
4. **Cache is now stale.**

How long can you tolerate stale data? That question drives your invalidation strategy.

---

## Strategy 1 — TTL-Based Invalidation

### How it works
Set a **Time To Live** on every cached key. When TTL expires, the key is automatically removed. The next request repopulates it from DB.

```
SET user:42 "{...}" EX 300    # expires in 5 minutes
```

### Pros
- Simple — no extra logic needed.
- Works automatically — no DB change events required.
- Redis handles cleanup natively.

### Cons
- Data is stale for up to TTL duration — no way around it.
- Setting TTL too short kills hit rate. Too long means stale data window.
- No immediate reaction to DB changes.

### When to use it
- Data that changes infrequently and where brief staleness is acceptable.
- Public content: product descriptions, blog posts, config settings.
- As a safety net alongside other strategies.

### Interview Q&A

**Q: What is TTL-based invalidation and what's its main tradeoff?**
> Every cache key gets an expiry time. When TTL hits zero, the key is deleted and the next request fetches fresh data from DB. Simple to implement but data can be stale for the entire TTL window — you can't react instantly to DB changes.

**Q: How do you choose the right TTL value?**
> Balance freshness vs hit rate. Short TTL = fresh data but more DB hits. Long TTL = better performance but staler data. Start with business requirements: how outdated can this data be before it causes a problem? For user-facing data, 60–300s is common. For config/static data, hours or days.

---

## Strategy 2 — Event-Based Invalidation (Explicit Delete)

### How it works
When data changes in the DB, the application **explicitly deletes or updates the cache key** immediately. No waiting for TTL.

```
# On DB write:
db.update("UPDATE users SET plan='pro' WHERE id=42")
redis.delete("user:42")    # immediately invalidate
```

Next read will miss → repopulate from DB with fresh data.

### Variants
- **Delete on write** (most common): invalidate cache, let next read repopulate.
- **Update on write**: write new value directly to cache (risky — race conditions).

### Pros
- Cache is invalidated the moment DB changes — near-zero staleness.
- Fine-grained control over which keys to invalidate.

### Cons
- Application code must remember to invalidate cache on every write path.
- If a write path is missed → stale data forever (until TTL saves you).
- Race condition: read can happen between DB write and cache delete, caching stale data.
- Complexity grows with number of write paths and cache keys.

### When to use it
- User account data, permissions, pricing — anything where stale data causes real problems.
- Combine with TTL as a fallback safety net.

### Interview Q&A

**Q: What is event-based cache invalidation?**
> On every DB write, the application explicitly deletes the corresponding cache key. The next read triggers a cache miss, fetches fresh data from DB, and repopulates the cache. Gives near-instant consistency compared to waiting for TTL.

**Q: What's the risk of "update on write" vs "delete on write"?**
> Update on write (writing new value directly to cache) risks race conditions — two concurrent writes may cache data out of order. Delete on write is safer: you invalidate the cache and let the next read fetch the authoritative value from DB, which is always the latest.

**Q: What happens if you forget to invalidate the cache on a write path?**
> Stale data lives in cache indefinitely — until TTL expires (if set) or until the bug is found. This is why TTL should always be used as a safety net even when you have explicit invalidation, and why write paths should be centralized (e.g. a repository layer) rather than scattered across the codebase.

---

## Strategy 3 — Write-Through Invalidation

### How it works
Every write updates **both the cache and the DB synchronously**. The cache is never stale because it's always updated at write time — not after.

```
# Write path:
redis.set("user:42", newData)   # update cache first
db.update(...)                   # update DB
# Both always in sync
```

This is the write-through caching strategy applied specifically to solve invalidation — the cache is always the source of truth for reads.

### Pros
- Cache and DB always in sync — zero staleness.
- No invalidation logic needed — data is always fresh.
- Reads always hit a warm cache.

### Cons
- Higher write latency — must write to two systems per write.
- Wastes cache space on data that's written but rarely read.
- If the cache write succeeds but DB write fails (or vice versa) → inconsistency. Needs careful error handling or transactions.

### When to use it
- Financial data, inventory, user permissions — where stale reads are unacceptable.
- Paired with read-through so all reads also go through cache.

### Interview Q&A

**Q: How does write-through solve cache invalidation?**
> It eliminates the invalidation problem entirely — every write updates cache and DB together, so the cache is never stale. You don't need to track which keys to invalidate because the cache is always kept current on every write.

**Q: What's the consistency risk in write-through?**
> If the cache write succeeds but the DB write fails, you have fresh data in cache but stale data in DB — an inverted problem. Mitigation: write to DB first, then update cache. If cache update fails, the TTL will eventually expire and the next read repopulates correctly.

---

## Comparison Table

| Strategy | Staleness Window | Complexity | Write Latency | Best For |
|---|---|---|---|---|
| **TTL-Based** | Up to TTL duration | Low | None | Infrequently changing data, fallback safety net |
| **Event-Based (Delete)** | Near-zero | Medium | Low | User data, permissions, pricing |
| **Write-Through** | Zero | Medium | Higher | Financial data, inventory, critical consistency |

### Quick decision guide
- **Simple, tolerates staleness?** → TTL-based
- **Need freshness, control per key?** → Event-based delete on write + TTL fallback
- **Zero staleness, always consistent?** → Write-through

---

## Interview Tip

> Interviewers love asking: *"How do you keep your cache consistent with the database?"* — the answer is always a combination. In practice, most production systems use **event-based invalidation + TTL as a fallback**. Write-through is reserved for data where even a second of staleness is unacceptable. Mention all three, explain the tradeoffs, then pick based on the system's consistency requirements.