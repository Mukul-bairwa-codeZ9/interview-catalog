# Cache Eviction Policies

When a cache is full and a new item needs to be stored, the cache must decide **which existing item to remove**. That decision is made by an **eviction policy**.

Choosing the right eviction policy directly impacts your cache hit rate, memory efficiency, and application performance.

---

## 1. LRU — Least Recently Used

### What it is
Evicts the item that **hasn't been accessed for the longest time**.

### How it works
- Every time an item is accessed, it moves to the "most recently used" position.
- When the cache is full, the item at the "least recently used" end gets evicted.
- Internally implemented using a **doubly linked list + hashmap** (O(1) get and put).

### When to use it
- User session data, news feeds, social media timelines — anything where **recent activity = relevance**.
- Most common default choice. Redis supports it via `allkeys-lru` or `volatile-lru`.

### Interview Q&A

**Q: Why is LRU the most commonly used eviction policy?**
> It works well in most real-world access patterns — recently accessed data is likely to be accessed again soon (temporal locality). It's a safe default.

**Q: What's the time complexity of LRU get and put?**
> O(1) for both, using a doubly linked list to track order and a hashmap for fast lookup.

**Q: What's a weakness of LRU?**
> It gets fooled by one-time large scans (e.g., a batch job reading millions of keys). Those keys evict your hot data even though they'll never be accessed again. LFU handles this better.

---

## 2. LFU — Least Frequently Used

### What it is
Evicts the item that has been **accessed the fewest number of times** overall.

### How it works
- Every item tracks an access **frequency counter**.
- When the cache is full, the item with the lowest counter is evicted.
- Tie-breaking (same frequency): evicts the least recently used among them.

### When to use it
- Recommendation engines, product catalogs, leaderboards — anything where **popularity = relevance**.
- Redis supports it via `allkeys-lfu` or `volatile-lfu`.

### Interview Q&A

**Q: How is LFU different from LRU?**
> LRU cares about *when* something was last accessed. LFU cares about *how many times* it was accessed. LFU is better at keeping truly popular items in cache, even if they haven't been accessed very recently.

**Q: What's the weakness of LFU?**
> New items start with a frequency of 1 and can get evicted immediately before they get a chance to become popular. This is called the **cache pollution problem** or **frequency bias against new items**. Redis mitigates this with a decay mechanism.

**Q: When would you pick LFU over LRU?**
> When your access pattern has clear "hot" items that stay popular over time — like trending products or frequently visited pages — LFU protects them from being evicted by a sudden burst of one-time accesses.

---

## 3. TTL — Time To Live

### What it is
Items are evicted **automatically after a set expiration time**, regardless of how often they were accessed.

### How it works
- Each key is assigned a TTL (e.g., 300 seconds).
- When the TTL expires, the key is marked as expired.
- Redis uses **lazy expiration** (deleted on next access) + **active expiration** (background sweep) to clean up expired keys.

### When to use it
- Auth tokens, OTP codes, rate limit counters, API response caches — anything with a **natural expiry**.
- Use when **data freshness matters more than cache hit rate**.

### Interview Q&A

**Q: What's the difference between TTL-based eviction and LRU/LFU eviction?**
> LRU/LFU evict based on access patterns when the cache is *full*. TTL evicts based on *time*, regardless of cache fullness. TTL is proactive; LRU/LFU are reactive.

**Q: How does Redis handle expired keys internally?**
> Two strategies: **lazy deletion** — the key is checked and deleted only when accessed. **Active deletion** — Redis periodically samples random keys and deletes expired ones. This avoids scanning all keys every second.

**Q: What's a risk of using very short TTLs?**
> Too short TTLs cause a low cache hit rate — data expires before it can be reused, so most requests go to the database. You want TTL to be long enough to absorb repeated requests, but short enough that stale data doesn't cause issues.

---

## 4. FIFO — First In, First Out

### What it is
Evicts the item that was **inserted into the cache first**, regardless of how often or recently it was accessed.

### How it works
- A simple queue. Newest items go to the back, oldest items are at the front.
- When the cache is full, the front item (oldest insert) is removed.
- No tracking of access frequency or recency — purely insertion-order based.

### When to use it
- Simple queues, job processing buffers, log pipelines — where **insertion order = processing order**.
- Rarely used in general-purpose caches because it ignores access patterns entirely.

### Interview Q&A

**Q: What's the main drawback of FIFO compared to LRU?**
> FIFO doesn't consider access patterns at all. A very frequently accessed item can get evicted just because it was inserted a long time ago, tanking your cache hit rate.

**Q: When would FIFO actually be the right choice?**
> When you genuinely don't care about access patterns — e.g., a simple message queue, a pipeline buffer, or when all items have equal value and you just need to limit memory. In practice, LRU almost always outperforms FIFO for caching.

**Q: How is FIFO different from TTL?**
> FIFO evicts based on insertion order (oldest in = first out). TTL evicts based on time elapsed since insertion (or last set). With TTL, a recently re-set key gets a fresh timer; with FIFO, its position in queue doesn't change.

---

## Comparison Table

| Policy | Evicts Based On | Best For | Redis Config |
|--------|----------------|----------|--------------|
| **LRU** | Least recently accessed | Sessions, feeds, general use | `allkeys-lru`, `volatile-lru` |
| **LFU** | Least frequently accessed | Popular/trending content | `allkeys-lfu`, `volatile-lfu` |
| **TTL** | Time expiry | Auth tokens, rate limits, fresh data | `volatile-ttl` + `EXPIRE` on keys |
| **FIFO** | Oldest insertion | Queues, buffers (rare in caching) | Not native in Redis |

### Quick decision guide
- **Default / unsure?** → LRU
- **Popularity matters?** → LFU
- **Data freshness matters?** → TTL
- **Simple queue semantics?** → FIFO