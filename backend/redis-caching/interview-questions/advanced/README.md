# Redis Caching — Advanced Interview Questions

> **Module**: Redis Caching  
> **Difficulty**: Advanced  
> **Topics**: Distributed cache consistency, hot key problem, cache warming, mutex lock deep dive, read-through vs write-through, high-traffic system design

---

## Q1: How do you maintain consistency between cache and database in a distributed system?

**Answer:**

This is one of the hardest caching problems. In distributed systems, cache and DB can go out of sync due to race conditions, network failures, or partial writes.

---

### The Core Problem — Race Condition

```
Thread A: reads DB → gets value "10"
Thread B: updates DB → sets value "20" → deletes cache key
Thread A: writes "10" to cache       ← STALE VALUE NOW IN CACHE
```
DB has "20", cache has "10". Inconsistent.

---

### Strategy 1: Cache-Aside + Delete on Write (most common)
Always **delete** the cache key on DB write — never update it directly.
```
Write flow:
  1. Write to DB
  2. DELETE cache key (not update)
  3. Next read will repopulate from DB
```
✅ Avoids stale write race condition  
❌ Still a small window where stale reads can happen between step 1 and 2

---

### Strategy 2: Write-Through with Transactions
Update cache and DB atomically using a distributed transaction or a queue.
```
Write flow:
  1. Begin transaction
  2. Write to DB
  3. Write to cache
  4. Commit
```
✅ Strong consistency  
❌ High complexity, latency, not always supported across Redis + DB

---

### Strategy 3: Outbox Pattern (most reliable for distributed systems)
DB write and cache invalidation event are stored together — a background worker processes them.
```
Write flow:
  1. Write to DB + write an "invalidate cache:key" event to outbox table (same DB transaction)
  2. Background worker reads outbox → sends cache invalidation to Redis
  3. Guaranteed: if DB write succeeds, cache WILL be invalidated eventually
```
✅ No lost invalidations even if Redis is temporarily down  
✅ Decouples write path from cache logic  
❌ Eventual consistency — small delay between DB update and cache invalidation

---

### Strategy 4: Read-Your-Writes Consistency
After a user writes data, route their next read to the DB (bypass cache) for a short window.
```
User updates profile → set flag: "bypass_cache:user:123" for 2 seconds
Next read for this user → skip cache, go to DB → then cache the fresh result
```
✅ User always sees their own writes immediately  
❌ Only solves consistency for the writing user, not all users

---

**Production recommendation:**
Use **Cache-Aside + Delete on Write** as baseline. Add the **Outbox Pattern** for critical data where lost invalidations are unacceptable (inventory, pricing, user auth).

**Follow-up you may get:** *"What is eventual consistency in the context of caching?"*
> It means the cache will become consistent with the DB — but not immediately. There's a window (usually milliseconds to seconds) where stale data may be served. Acceptable for most read-heavy systems, not acceptable for financial or auth data.

---

## Q2: Deep dive — how do you implement a mutex lock to prevent cache stampede?

**Answer:**

The goal: when a cache key expires, only **one request** should rebuild it. All others should wait or get stale data.

---

### Implementation using Redis SET NX (atomic lock)

```javascript
async function getWithLock(key, ttl, fetchFromDB) {
  // 1. Try cache first
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const lockTTL = 5; // seconds — prevent deadlock if process crashes

  // 2. Try to acquire lock (SET only if NOT EXISTS)
  const lockAcquired = await redis.set(lockKey, '1', 'EX', lockTTL, 'NX');

  if (lockAcquired) {
    try {
      // 3. Got lock — fetch from DB and populate cache
      const data = await fetchFromDB();
      await redis.set(key, JSON.stringify(data), 'EX', ttl);
      return data;
    } finally {
      // 4. Always release lock
      await redis.del(lockKey);
    }
  } else {
    // 5. Didn't get lock — wait and retry (or serve stale)
    await sleep(100); // wait 100ms
    return getWithLock(key, ttl, fetchFromDB); // retry
  }
}
```

---

### Why `SET NX` is atomic and safe
`SET key value EX 5 NX` — sets the key **only if it doesn't exist**, in a single atomic Redis operation. No two processes can acquire the same lock simultaneously.

---

### Stale-while-revalidate variant (better UX)
Instead of making requests wait, serve the **expired (stale) value** while one request refreshes in background.
```javascript
// Store value with a "soft TTL" inside the payload
const payload = {
  data: result,
  softExpiry: Date.now() + (ttl * 1000)  // logical expiry
};
// Set Redis TTL longer than soft expiry (grace period)
await redis.set(key, JSON.stringify(payload), 'EX', ttl + 60);

// On read:
if (Date.now() > payload.softExpiry) {
  // Serve stale data immediately
  refreshInBackground(key); // async, non-blocking
}
return payload.data;
```

---

**Follow-up you may get:** *"What happens if the process holding the lock crashes?"*
> The lock TTL (`EX 5`) ensures the lock auto-expires after 5 seconds, preventing a permanent deadlock. Next request will acquire the lock and rebuild the cache.

---

## Q3: What is the hot key problem and how do you solve it?

**Answer:**

A **hot key** is a single Redis key that receives a disproportionately high number of requests — so many that it overwhelms a single Redis node.

```
Example: A celebrity tweets → 2 million users load their profile
  → All 2M requests hit: GET user:celebrity_id
  → Single Redis node gets hammered
  → That node becomes a bottleneck for the entire cluster
```

---

### Solutions:

### 1. Local In-Process Cache (most effective)
Cache hot keys in the **application's own memory** (e.g., a simple JS Map or LRU cache library).
```javascript
const localCache = new LRUCache({ max: 100, ttl: 5000 }); // 5 second local cache

async function getUser(id) {
  if (localCache.has(id)) return localCache.get(id); // served from app memory
  const data = await redis.get(`user:${id}`);
  localCache.set(id, data);
  return data;
}
```
✅ Zero Redis calls for repeat hot key reads within 5 seconds  
✅ Distributes load across all app server instances  
❌ Each app server has slightly different data (acceptable for 5s staleness)

---

### 2. Key Sharding / Replication
Duplicate the hot key across multiple Redis keys with a random suffix, read from a random one.
```javascript
// Write: replicate to N shards
for (let i = 0; i < 10; i++) {
  await redis.set(`user:celebrity_id:${i}`, data, 'EX', 300);
}

// Read: pick a random shard
const shard = Math.floor(Math.random() * 10);
const data = await redis.get(`user:celebrity_id:${shard}`);
```
✅ Spreads read load across 10 Redis nodes  
❌ Writes must update all shards, invalidation is complex

---

### 3. Read Replicas
Route read traffic to Redis read replicas, keep writes on the primary.
```
Writes → Redis Primary
Reads  → Redis Replica 1, 2, 3 (load balanced)
```
✅ Scales reads horizontally  
❌ Slight replication lag (replica may serve slightly stale data)

---

**Detection first:** Before solving, detect hot keys using Redis's built-in hotkey analysis:
```bash
redis-cli --hotkeys        # identifies top accessed keys
redis-cli monitor          # real-time command stream (use carefully in prod)
```

**Follow-up you may get:** *"How does key sharding differ from Redis Cluster sharding?"*
> Redis Cluster shards keys across nodes automatically by key hash slot. Key sharding for hot keys is manual — you intentionally replicate one popular key to spread its read load, which Redis Cluster doesn't do on its own.

---

## Q4: What is cache warming and when do you need it?

**Answer:**

**Cache warming** (also called cache priming) is the process of **proactively loading data into the cache** before real traffic arrives — instead of waiting for cold cache misses to populate it lazily.

---

### When you need it:

1. **After a deployment or server restart** — cache is empty, all requests miss → DB gets hammered
2. **Before a traffic spike** — product launch, Black Friday, scheduled event
3. **After cache flush/eviction** — intentional or accidental cache clear
4. **New cache node added** — node has no data yet

---

### Warming strategies:

### 1. Startup Script
Run a script before deploying that pre-loads the most accessed keys.
```javascript
async function warmCache() {
  const topProducts = await db.query(
    'SELECT * FROM products ORDER BY view_count DESC LIMIT 1000'
  );
  for (const product of topProducts) {
    await redis.set(`product:${product.id}`, JSON.stringify(product), 'EX', 3600);
  }
  console.log('Cache warmed: 1000 top products loaded');
}
```

### 2. Traffic Replay / Shadow Warm
Replay recent production request logs against the new cache to pre-populate it with real access patterns.

### 3. Lazy Warm with DB Fallback + Monitoring
Don't pre-warm, but track cache miss rate. If miss rate is high after deploy, trigger a warm-up job automatically.

---

### Cache warming in Redis Cluster (new node scenario)
When a new Redis node joins the cluster, it starts empty. Slot migration from existing nodes carries data, but for large datasets this takes time. During migration, monitor miss rates and consider pausing traffic to the new node until it's warm.

---

**Follow-up you may get:** *"What's the risk of cache warming?"*
> Warming consumes DB resources (you're reading everything). Do it during off-peak hours or rate-limit the warm-up queries to avoid overloading the DB while it's also serving live traffic.

---

## Q5: How would you design a caching layer for a system handling 1 million requests per second?

**Answer:**

This is a **system design** question. Structure your answer in layers:

---

### Step 1: Identify what to cache
Not everything needs caching. Focus on:
- High read-to-write ratio (user profiles, product catalog, config)
- Expensive computations (recommendation scores, search results)
- Shared data (same data served to many users)

---

### Step 2: Multi-layer cache architecture

```
Client Request
    │
    ▼
[Layer 1] CDN / Edge Cache          ← static assets, public API responses
    │ miss
    ▼
[Layer 2] Local In-Process Cache    ← per app server, LRU, ~5-10s TTL
    │ miss
    ▼
[Layer 3] Redis Cluster             ← distributed cache, millisecond reads
    │ miss
    ▼
[Layer 4] Database                  ← source of truth, last resort
```

---

### Step 3: Redis Cluster setup for scale

```
Redis Cluster: 6 nodes (3 primary + 3 replicas)
  → Primary handles writes + some reads
  → Replicas handle read overflow
  → 16,384 hash slots distributed across primaries
  → Auto-failover if a primary goes down
```

At 1M req/sec, a single Redis node handles ~100K-500K ops/sec depending on payload size. You need **horizontal sharding** via Redis Cluster.

---

### Step 4: Handle hot keys
Use **local in-process cache** (Layer 2) to absorb hot key traffic before it reaches Redis.

### Step 5: Cache invalidation strategy
- TTL as baseline safety net
- Event-based invalidation via message queue (Kafka/SQS) for critical data
- Outbox pattern for guaranteed invalidation

### Step 6: Observability
Track:
- Cache hit rate (target: >90%)
- P99 Redis latency (target: <5ms)
- Eviction rate (high eviction = undersized cache)
- Hot key alerts

---

**Follow-up you may get:** *"What would you do if Redis itself becomes the bottleneck?"*
> Add more nodes to the cluster, increase read replicas, push more traffic to local in-process cache, and audit TTLs to ensure memory isn't being wasted on rarely-accessed keys.

---

## Q6: What is the difference between Read-Through and Write-Through cache?

**Answer:**

Both are patterns where the **cache itself** handles DB interaction — unlike Cache-Aside where the application does it manually.

---

### Read-Through Cache
Cache sits **in front of the DB**. On a miss, the **cache** (not the app) fetches from DB and stores it.
```
App → Cache
         ├── HIT  → return data
         └── MISS → Cache fetches from DB → stores → returns to App
```
**vs Cache-Aside:** In Cache-Aside, the *app* fetches from DB on miss. In Read-Through, the *cache layer* does it automatically.

✅ App code is simpler — always just reads from cache  
✅ Consistent loading logic in one place  
❌ First read is still slow (cold miss)  
❌ Requires a cache provider that supports this (e.g., AWS ElastiCache with read-through config, or a library like `node-cache-manager`)

---

### Write-Through Cache
Every write goes through the **cache** first, which synchronously writes to DB before acknowledging.
```
App → Cache → DB (synchronous, both succeed or both fail)
           ← ACK to App only after DB write confirmed
```

✅ Cache and DB always in sync  
✅ No stale data  
❌ Higher write latency (waits for DB)  
❌ Caches data even if it's never read again (wasted memory)

---

### Side-by-side comparison

| | Cache-Aside | Read-Through | Write-Through |
|--|------------|-------------|--------------|
| Who loads cache on miss | Application | Cache layer | N/A |
| Who writes to DB | Application | Application | Cache layer |
| Stale data risk | Yes | Yes | No |
| App code complexity | Medium | Low | Low |
| Write latency | Low | Low | Higher |

---

**Follow-up you may get:** *"Can you combine Read-Through and Write-Through?"*
> Yes — this is the most coherent combo. Read-Through handles reads, Write-Through handles writes. The cache layer manages all DB interaction. App code just talks to the cache. This is how many managed caching solutions (like AWS DAX for DynamoDB) work.

---

## 🗣️ Interview Answer Template

For advanced caching questions (especially system design), use this structure:

```
1. RESTATE THE PROBLEM    — Show you understand the challenge
2. IDENTIFY THE TRADEOFFS — Consistency vs availability vs complexity
3. PROPOSE A LAYERED SOLUTION — Don't jump to one answer
4. JUSTIFY EACH CHOICE    — Why this over alternatives?
5. ACKNOWLEDGE FAILURE MODES — What can go wrong? How do you recover?
6. SCALE CONSIDERATION    — How does your solution behave at 10x load?
```

**Example for "How do you handle cache consistency at scale?":**
> "The core challenge is that cache and DB updates can't be made atomic across two separate systems. My baseline approach is Cache-Aside with delete-on-write — always delete the cache key after a DB write, never update it directly. This avoids the write race condition. For critical data like inventory or pricing, I'd add the Outbox Pattern to guarantee cache invalidation even if Redis is temporarily unavailable. The tradeoff is eventual consistency — there's a brief window of stale reads — which is acceptable for most use cases but not for financial transactions. I'd also instrument cache hit rate and invalidation failure rate to detect problems early."

---

*Module complete. See also: [`easy.md`](./easy.md) | [`medium.md`](./medium.md)*