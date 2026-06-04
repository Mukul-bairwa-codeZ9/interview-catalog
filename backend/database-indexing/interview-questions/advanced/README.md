# Database Indexing — Advanced Interview Questions

---

## Q1. How would you design indexes for a multi-tenant SaaS database?

**Answer:**

In a multi-tenant system, every query is scoped to a specific tenant. If indexes don't reflect this, you'll scan across all tenants' data to find one tenant's rows — which kills performance at scale.

**Core rule: `tenant_id` must be the leftmost column in every composite index.**

```sql
-- Bad: index on email alone
CREATE INDEX idx_email ON users (email);
-- Query for tenant 42 still scans all tenants' emails

-- Good: tenant_id first
CREATE INDEX idx_tenant_email ON users (tenant_id, email);
-- Now filtered to tenant 42 immediately, then finds email
```

**Common patterns:**

| Query pattern | Index design |
|---|---|
| Lookup by tenant + user | `(tenant_id, user_id)` |
| List records by tenant + date | `(tenant_id, created_at DESC)` |
| Search by tenant + status | `(tenant_id, status, updated_at)` |

**Bonus — Partial indexes per tenant (for very large tenants):**
```sql
-- If tenant 1 has 50M rows, a partial index reduces scan scope further
CREATE INDEX idx_tenant1_orders ON orders (created_at) 
WHERE tenant_id = 1;
```

**Schema strategy consideration:**
- **Shared schema** (all tenants, one table) → composite indexes with `tenant_id` first are critical
- **Schema-per-tenant** → each tenant gets their own indexes, simpler but harder to manage at scale

**One-liner for interviews:**
> "In multi-tenant systems, every index must lead with `tenant_id` — otherwise queries for one tenant scan all tenants' data. Tenant isolation in the index is as important as in the application layer."

---

## Q2. How do indexes interact with transactions and row-level locking?

**Answer:**

Indexes don't just affect read performance — they affect **which rows get locked** during writes, and how long locks are held.

**Index lookup → precise locking:**
```sql
-- With index on user_id: only locks the matching row
UPDATE orders SET status = 'shipped' WHERE user_id = 42;

-- Without index: full table scan → may lock many rows or the whole table
-- (depends on isolation level and DB engine)
```

**Gap locks (MySQL InnoDB — REPEATABLE READ):**
When doing a range query without finding an exact match, MySQL acquires **gap locks** to prevent phantom reads:
```sql
-- Locks the gap between existing rows, not just matching rows
SELECT * FROM orders WHERE order_id BETWEEN 100 AND 200 FOR UPDATE;
```
An index helps narrow the gap, reducing the range of locks held.

**Deadlocks and indexes:**
- Two transactions updating different rows but accessing them via different indexes can deadlock
- Adding a missing index can sometimes resolve deadlocks by making row access more predictable

**Index scans hold locks shorter:**
- Index scan → find row fast → lock acquired and released quickly
- Full table scan → long scan → lock held longer → more contention

**One-liner for interviews:**
> "Indexes reduce lock contention by making row lookups precise and fast — a missing index during a write can cause full table scans that hold locks far longer than necessary, creating bottlenecks under concurrency."

---

## Q3. How would you design indexes for a time-series query pattern?

**Answer:**

Time-series data (logs, events, metrics, IoT readings) has unique characteristics:
- Always appended (INSERT heavy, rarely updated)
- Queries almost always filter by time range
- Recent data is queried far more than old data

**Core index pattern:**
```sql
-- Filter by entity + time range
CREATE INDEX idx_metrics ON events (device_id, recorded_at DESC);

-- Query becomes:
SELECT * FROM events 
WHERE device_id = 'sensor-99' 
AND recorded_at > NOW() - INTERVAL '24 hours'
ORDER BY recorded_at DESC;
```

**Why `DESC` on the time column matters:**
Most time-series queries want the **latest** records. An index sorted DESC serves these queries without a sort step.

**The real scaling solution — partitioning:**
Time-series tables grow unboundedly. Indexes on a 10-billion-row table become enormous and slow. The real answer is **time-based partitioning**:

```sql
-- PostgreSQL: partition by month
CREATE TABLE events_2024_01 PARTITION OF events
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

Each partition has its own smaller index → queries on recent data only scan the recent partition's index.

**Retention + index maintenance:**
- Old partitions can be dropped entirely (dropping partition = instant, vs DELETE which leaves bloat)
- Indexes stay small as old data is removed

**Purpose-built option:**
For true time-series at scale, consider TimescaleDB, InfluxDB, or ClickHouse — they handle time-based indexing and compression natively.

**One-liner for interviews:**
> "For time-series, I'd use a composite index on (entity_id, timestamp DESC), combine it with time-based table partitioning so indexes stay small, and consider purpose-built time-series databases at extreme scale."

---

## Q4. What are the dangers of over-indexing and how do you audit indexes in production?

**Answer:**

Over-indexing is a real production problem — teams add indexes reactively to fix slow queries but never remove them.

**The dangers:**

| Problem | Impact |
|---|---|
| Every index slows writes | High INSERT/UPDATE throughput drops |
| Indexes consume memory | Buffer pool polluted with rarely-used index pages |
| Query planner confusion | Too many indexes → planner picks wrong one → slower query |
| Index bloat accumulates faster | More indexes = more dead entries to clean up |
| Maintenance overhead | VACUUM, REINDEX, backups all take longer |

**How to audit unused indexes (PostgreSQL):**
```sql
-- Find indexes that have never been used since last stats reset
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,       -- number of times index was used
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

**How to find duplicate/redundant indexes:**
```sql
-- Indexes where one is a prefix of another (redundant)
-- e.g., (user_id) is redundant if (user_id, created_at) exists
-- pg_index can be queried to find overlapping column sets
```

**Safe process to remove an index:**
1. Identify unused index via `pg_stat_user_indexes`
2. Mark it invalid first (don't drop immediately)
3. Monitor for a few days — if no complaints, drop it
4. In PostgreSQL: `DROP INDEX CONCURRENTLY idx_name` (no table lock)

**One-liner for interviews:**
> "Over-indexing slows writes, wastes memory, and confuses the query planner. I'd audit `pg_stat_user_indexes` for zero-scan indexes, identify redundant prefix indexes, and drop them with CONCURRENTLY to avoid downtime."

---

## Q5. How does the query planner decide whether to use an index or do a full scan?

**Answer:**

The query planner is a cost-based optimizer. It estimates the cost of every possible plan and picks the cheapest one. It doesn't always use an index — sometimes a full scan genuinely is faster.

**Cost estimation factors:**

| Factor | Effect |
|---|---|
| Table size | Larger table → index more valuable |
| Index selectivity | More selective → index preferred |
| Query result size | If >10–20% of rows returned, full scan often cheaper |
| Page cache (buffer hit rate) | If table fits in memory, full scan is fast anyway |
| Statistics freshness | Stale stats → wrong row estimates → wrong plan |

**Example — when planner ignores a valid index:**
```sql
-- If 80% of users have is_active = true, this may do a full scan
SELECT * FROM users WHERE is_active = true;
-- Fetching 800K rows via index = 800K pointer hops = slower than just scanning
```

**Forcing the planner (use sparingly):**
```sql
-- PostgreSQL: disable seq scan to force index (debugging only)
SET enable_seqscan = OFF;

-- MySQL: hint
SELECT * FROM users USE INDEX (idx_active) WHERE is_active = true;
```

**Fix bad plans properly:**
```sql
-- Refresh statistics so planner has accurate row estimates
ANALYZE users;

-- Check if autovacuum is running — stale stats cause bad plans
SELECT * FROM pg_stat_user_tables WHERE relname = 'users';
```

**One-liner for interviews:**
> "The planner uses cost estimation — table size, selectivity, and statistics — to decide between index scan and full scan. If it's making bad choices, I'd first check if statistics are stale with ANALYZE before reaching for query hints."

---

## Q6. How do you handle indexing when doing a large bulk data migration or load?

**Answer:**

Loading data into a table with many indexes is dramatically slower because every row insert must update every index in real time.

**The right approach — drop indexes first, rebuild after:**

```sql
-- Step 1: Drop non-essential indexes before bulk load
DROP INDEX CONCURRENTLY idx_orders_customer;
DROP INDEX CONCURRENTLY idx_orders_status;

-- Step 2: Bulk insert (now only primary key index maintained)
INSERT INTO orders SELECT * FROM orders_staging;
-- or: COPY orders FROM '/data/orders.csv' CSV;

-- Step 3: Rebuild indexes after load (much faster in batch)
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);
CREATE INDEX CONCURRENTLY idx_orders_status ON orders (status);
```

**Why rebuilding after is faster:**
- Inserting 10M rows → updating index 10M times = random I/O
- Building index on 10M existing rows = sequential scan + sort = much faster

**Additional tips:**
- Disable triggers and foreign key checks during load (if safe)
- Use `COPY` instead of INSERT — far faster for bulk loads in PostgreSQL
- Set `maintenance_work_mem` higher during index rebuild to use more RAM for sorting

**PostgreSQL bulk load checklist:**
1. Drop indexes (except PK)
2. Increase `maintenance_work_mem`
3. Run COPY / bulk INSERT
4. Rebuild indexes with CONCURRENTLY
5. Run ANALYZE to refresh statistics
6. Re-enable triggers/FK checks

**One-liner for interviews:**
> "For bulk loads, I drop non-PK indexes first, load the data, then rebuild indexes in batch — building an index on existing data is far faster than maintaining it row-by-row during insertion."

---

## Q7. How would you index a table to support full-text search?

**Answer:**

Standard B-Tree indexes can't handle full-text search (`LIKE '%keyword%'` causes a full scan). You need specialized index types.

**PostgreSQL — GIN index with tsvector:**
```sql
-- Add a tsvector column (stores tokenized, normalized text)
ALTER TABLE articles ADD COLUMN search_vector tsvector;

-- Populate it
UPDATE articles SET search_vector = to_tsvector('english', title || ' ' || body);

-- Create GIN index on it
CREATE INDEX idx_articles_fts ON articles USING GIN(search_vector);

-- Query
SELECT * FROM articles 
WHERE search_vector @@ to_tsquery('english', 'database & indexing');
```

**GIN vs GiST for full-text:**

| | GIN | GiST |
|---|---|---|
| Build time | Slower | Faster |
| Query speed | Faster | Slower |
| Size | Larger | Smaller |
| Best for | Read-heavy FTS | Write-heavy FTS |

**MySQL — FULLTEXT index:**
```sql
CREATE FULLTEXT INDEX idx_fts ON articles (title, body);

SELECT * FROM articles 
WHERE MATCH(title, body) AGAINST('database indexing' IN NATURAL LANGUAGE MODE);
```

**When to move to a dedicated search engine:**
- Need relevance ranking, fuzzy matching, typo tolerance, faceting → use **Elasticsearch** or **Typesense**
- PostgreSQL FTS is good for moderate needs; Elasticsearch for serious search features

**One-liner for interviews:**
> "B-Tree indexes can't handle LIKE '%keyword%'. For full-text search in PostgreSQL, I'd use a GIN index on a tsvector column. For advanced needs like relevance ranking or fuzzy search, I'd move to Elasticsearch."

---

## Q8. A query was fast last month but is slow now — how do you debug it?

**Answer:**

This is a classic production incident question. The index likely still exists — something else changed.

**Systematic debugging approach:**

**Step 1 — Check if the query plan changed:**
```sql
EXPLAIN ANALYZE <your slow query>;
-- Compare to what you'd expect: is it doing a Seq Scan where it used to use an index?
```

**Step 2 — Check if statistics are stale:**
```sql
-- Large gap between estimated rows and actual rows = stale stats
-- Fix:
ANALYZE table_name;
```

**Step 3 — Check if data distribution changed:**
- Table grew 10x → planner thresholds changed → different plan chosen
- A column's distribution skewed (e.g., 90% of rows now have `status = 'closed'`) → planner estimates wrong

**Step 4 — Check for index bloat:**
```sql
SELECT pg_size_pretty(pg_relation_size('idx_name'));
-- If index is unexpectedly large, bloat may be slowing scans
REINDEX INDEX CONCURRENTLY idx_name;
```

**Step 5 — Check if index was accidentally dropped:**
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'orders';
```

**Step 6 — Check for lock contention or autovacuum lag:**
```sql
SELECT * FROM pg_stat_user_tables WHERE relname = 'orders';
-- Check n_dead_tup (dead tuples) — high value = autovacuum not keeping up
```

**Root causes ranked by likelihood:**
1. Stale statistics → wrong row estimate → wrong plan (most common)
2. Data growth crossed a threshold → planner switched to seq scan
3. Index bloat degrading scan speed
4. Index accidentally dropped (migrations gone wrong)
5. Lock contention from a long-running transaction

**One-liner for interviews:**
> "First I'd run EXPLAIN ANALYZE to see if the plan changed, then check if statistics are stale with ANALYZE, then look at data growth, index bloat, and whether the index still exists — stale stats are the most common culprit."