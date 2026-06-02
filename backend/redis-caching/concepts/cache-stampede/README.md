# Cache Stampede (Thundering Herd)

## What it is

A **cache stampede** happens when a popular cache key expires and many requests arrive simultaneously — all of them miss the cache and hit the database at the same time.

The result: a sudden spike of DB queries for the same data, which can overwhelm the database and cause cascading failures.

Also called: **thundering herd problem** or **dog-piling**.

---

## Why it happens

1. A hot key (e.g. homepage data, top products) is cached with a TTL.
2. TTL expires.
3. Before the cache is repopulated, 100s of concurrent requests all check the cache.
4. All get a MISS → all query the DB simultaneously.
5. DB gets hammered → slow responses → more requests pile up → potential outage.

The more popular the key, the worse the stampede.

---

## Solution 1 — Mutex Lock (Cache Lock)

### How it works
When a cache miss occurs, only **one request** is allowed to fetch from the DB and repopulate the cache. All other requests **wait** until the cache is repopulated, then read from cache.

Implemented with `SETNX` (set if not exists) in Redis — acts as a distributed lock.

```
SETNX lock:homepage 1 EX 5   # only first request gets the lock
```

### Pros
- DB gets exactly 1 query per miss — no stampede.
- Simple to implement with Redis `SETNX`.

### Cons
- Other requests block/wait → adds latency under high load.
- If the lock holder crashes, you need a lock TTL to auto-release it.

### Interview Q&A

**Q: How do you prevent a cache stampede using a mutex?**
> On a cache miss, use Redis `SETNX` to acquire a lock. Only the request that gets the lock fetches from DB and repopulates the cache. All other requests either wait and retry, or serve stale data temporarily. The lock has a short TTL to auto-release if the holder crashes.

**Q: What's the risk of a mutex lock approach?**
> If the lock TTL is too short, the lock expires before the DB fetch completes and multiple requests grab the lock. If too long, users wait unnecessarily. Also adds latency for all waiting requests during repopulation.

---

## Solution 2 — Probabilistic Early Expiry (XFetch)

### How it works
Instead of waiting for TTL to hit zero, each request has a **random chance of refreshing the cache early** — before it actually expires. The closer to expiry, the higher the probability of triggering an early refresh.

No locking needed. One request refreshes proactively while others keep serving the still-valid cached data.

Formula: refresh if `current_time - β × δ × log(rand()) > expiry_time`
- `β` = tuning constant (typically 1)
- `δ` = time it takes to recompute the value

### Pros
- No waiting — all requests keep being served from cache.
- No locking complexity.
- Cache is refreshed before it expires — zero miss window.

### Cons
- Slightly complex to implement correctly.
- May trigger early refreshes more often than needed under very high traffic.

### Interview Q&A

**Q: What is probabilistic early expiry and how does it prevent stampede?**
> Instead of letting TTL expire and causing a miss, each request calculates a probability of refreshing the cache early based on how close to expiry the key is. One request refreshes proactively while all others continue reading valid cached data — no miss ever occurs, so no stampede.

**Q: How is probabilistic early expiry better than mutex locking?**
> Mutex blocks waiting requests and adds latency. Probabilistic early expiry has no blocking — all requests continue serving from cache while one quietly refreshes in the background. It's more scalable under high traffic.

---

## Solution 3 — Background Refresh (Stale-While-Revalidate)

### How it works
When a key is about to expire (or has expired), serve the **stale cached value immediately** and trigger a **background job** to refresh the cache asynchronously.

The user never sees a miss — they get slightly stale data for a brief period while the refresh happens.

### Pros
- Zero added latency — stale data returned instantly.
- DB gets exactly 1 refresh query regardless of traffic.
- Simplest user experience — no waiting.

### Cons
- Users may briefly see stale data (acceptable for most use cases).
- Need a background worker or async process.
- Not suitable when data freshness is critical (e.g. stock prices, inventory counts).

### Interview Q&A

**Q: What is stale-while-revalidate and when would you use it?**
> Return stale cached data immediately on expiry while refreshing the cache in the background. Use it when a brief period of slightly stale data is acceptable — news feeds, product listings, dashboards. Not suitable for real-time accuracy requirements like pricing or inventory.

**Q: How does background refresh differ from cache-aside on a miss?**
> Cache-aside blocks the current request — it waits for the DB fetch before returning. Background refresh returns stale data immediately and refreshes asynchronously. Background refresh prioritizes low latency over freshness; cache-aside prioritizes freshness over latency.

---

## Comparison Table

| Solution | Latency Impact | Data Freshness | Complexity | Best For |
|---|---|---|---|---|
| **Mutex Lock** | High (waiters block) | Immediate after refresh | Low | Low-traffic, strong consistency needed |
| **Probabilistic Early Expiry** | None | Always fresh (no miss) | Medium | High-traffic, hot keys |
| **Background Refresh** | None (serves stale) | Slightly stale briefly | Low-Medium | Read-heavy, freshness not critical |

### Quick decision guide
- **Simple fix, low traffic?** → Mutex Lock
- **High traffic, hot keys, zero miss?** → Probabilistic Early Expiry
- **Stale data OK, lowest latency?** → Background Refresh (stale-while-revalidate)

---

## Interview Tip

> "Cache stampede" is almost always followed by a system design follow-up: *"How would you design a high-traffic homepage cache?"* — mention TTL + one of the three solutions above, explain the tradeoff, and pick the one that fits the requirements. Examiners want to see you know the problem exists AND that you have multiple solutions with tradeoffs.