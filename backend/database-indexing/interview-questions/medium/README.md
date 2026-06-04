# Database Indexing — Medium Interview Questions

---

## Q1. What is a covering index and how does it improve performance?

**Answer:**

A covering index is an index that contains **all the columns a query needs** — so the database satisfies the entire query from the index alone, never touching the actual table rows.

**Normal index lookup — two steps:**
```sql
-- Index on last_name only
CREATE INDEX idx_last_name ON users (last_name);

SELECT name, email FROM users WHERE last_name = 'Smith';
-- Step 1: Search index → find row pointers for 'Smith'
-- Step 2: Follow each pointer → fetch full row from table (heap fetch)
--         ↑ This is the expensive part — random I/O to table pages
```

**Covering index — one step:**
```sql
-- Index includes all columns the query needs
CREATE INDEX idx_covering ON users (last_name, name, email);

SELECT name, email FROM users WHERE last_name = 'Smith';
-- Step 1: Search index → find 'Smith' entries
-- Step 2: ✅ name and email are IN the index — no table access needed
```

**How to spot it in EXPLAIN:**
```sql
EXPLAIN SELECT name, email FROM users WHERE last_name = 'Smith';
-- Look for: "Index Only Scan" (PostgreSQL) or "Using index" (MySQL)
-- This confirms the query was served entirely from the index
```

**When to use:**
- High-frequency queries that always select the same small column set
- The extra storage cost of including more columns in the index is worth it

**When NOT to use:**
- Don't include every column — wide indexes are expensive to maintain on writes
- Only include the columns that specific hot query actually needs

**One-liner for interviews:**
> "A covering index contains all columns a query needs, so the database never touches the table rows — eliminating the most expensive part of an index lookup: the heap fetch."

---

## Q2. What is the left-prefix rule and why does it matter for composite indexes?

**Answer:**

A composite index is physically sorted by its columns in order — left to right. The database can only use the index starting from the leftmost column. Skipping a column breaks the sort order and makes the index useless for that query.

```sql
CREATE INDEX idx_orders ON orders (customer_id, status, created_at);
-- Sorted by: customer_id → then status within each customer → then created_at within each status
```

**Usage table:**

| Query | Index used? | Reason |
|---|---|---|
| `WHERE customer_id = 5` | ✅ Full prefix | Starts from left |
| `WHERE customer_id = 5 AND status = 'paid'` | ✅ Full prefix | Left + second column |
| `WHERE customer_id = 5 AND status = 'paid' AND created_at > '2024-01-01'` | ✅ All three | Full index used |
| `WHERE status = 'paid'` | ❌ None | Skips leftmost |
| `WHERE created_at > '2024-01-01'` | ❌ None | Skips leftmost |
| `WHERE customer_id = 5 AND created_at > '2024-01-01'` | ⚠️ Partial | Uses `customer_id`, skips `status` gap, stops |

**Why the last case only partially works:**
The index is sorted by `status` within each `customer_id`. If you skip `status`, the `created_at` values aren't in any useful global order — so the DB uses the index only for `customer_id` filtering, then scans the rest.

**Design rules:**
```
1. Equality filter columns → leftmost positions
2. Range filter column (BETWEEN, >, <) → rightmost position
3. ORDER BY column → can go last (avoids a sort step)

Example query: WHERE customer_id = 5 AND status = 'paid' ORDER BY created_at DESC
Best index:    (customer_id, status, created_at DESC)
```

**One-liner for interviews:**
> "The left-prefix rule means a composite index can only be used starting from its leftmost column — skipping a column breaks the sort order and forces the planner to fall back to a scan."

---

## Q3. How do you identify a slow query caused by a missing index?

**Answer:**

A systematic approach: find the slow query → inspect its execution plan → confirm missing index → add and verify.

**Step 1 — Surface the slow query:**
```sql
-- PostgreSQL: enable slow query logging
SET log_min_duration_statement = 1000;  -- log queries > 1 second
-- Or check pg_stat_statements for top queries by total time:
SELECT query, total_exec_time, calls, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- MySQL: slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
```

**Step 2 — Run EXPLAIN and look for red flags:**
```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
```

| Signal | What it means |
|---|---|
| `Seq Scan` (PG) / `type: ALL` (MySQL) | Full table scan — no index used |
| `rows=5000000` | Examining millions of rows for a small result |
| `Extra: Using filesort` | Sorting without an index — expensive |
| `Extra: Using temporary` | Temp table created — very expensive |
| `cost=0..95000` | High cost estimate = planner expects a lot of work |

**Step 3 — Add the index:**
```sql
CREATE INDEX CONCURRENTLY idx_orders_customer_status ON orders (customer_id, status);
-- CONCURRENTLY = no table lock, safe to run on production
```

**Step 4 — Verify the plan improved:**
```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
-- Now should show: Index Scan using idx_orders_customer_status
-- rows= should drop dramatically
```

**Step 5 — Monitor in production:**
- Check slow query log — did that query disappear?
- Check `pg_stat_user_indexes` — confirm the new index is being used (`idx_scan > 0`)

**One-liner for interviews:**
> "I'd check slow query logs to find the query, run EXPLAIN to confirm it's doing a full scan, add the right index with CONCURRENTLY, then verify the plan switched to an index scan and confirm it in production logs."

---

## Q4. What does EXPLAIN / EXPLAIN ANALYZE tell you?

**Answer:**

`EXPLAIN` shows the **query execution plan** the database chose — without running the query.
`EXPLAIN ANALYZE` **actually executes** the query and shows real timing alongside the estimated plan.

**Full example (PostgreSQL):**
```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC;
```

```
Sort (cost=150.25..152.75 rows=1000) (actual time=2.1..2.3 rows=847)
  Sort Key: created_at DESC
  -> Index Scan using idx_orders_customer on orders
       Index Cond: (customer_id = 42)
       (actual time=0.05..1.8 rows=847)
Planning Time: 0.12 ms
Execution Time: 2.4 ms
```

**Key terms to understand:**

| Term | Meaning |
|---|---|
| `Seq Scan` | Full table scan — bad on large tables |
| `Index Scan` | Found rows via index, then fetched from table |
| `Index Only Scan` | Covering index — never touched the table |
| `Bitmap Heap Scan` | Used index to get row locations, fetched in batches |
| `cost=X..Y` | Estimated cost (startup cost .. total cost) — relative units |
| `rows=N` | Planner's estimated row count |
| `actual rows=N` | Real row count after execution (ANALYZE only) |
| `Planning Time` | Time to build the query plan |
| `Execution Time` | Actual query runtime |

**The most important thing to check:**
```
Estimated rows vs Actual rows

Estimated: 100 rows
Actual:    500,000 rows   ← HUGE gap = stale statistics = wrong plan chosen
```

**Fix stale statistics:**
```sql
ANALYZE orders;  -- refreshes row count and distribution stats
-- Then re-run EXPLAIN ANALYZE to see if estimate improved
```

**One-liner for interviews:**
> "EXPLAIN shows the plan the optimizer chose. I look for Seq Scans on large tables, large gaps between estimated and actual rows (stale stats), filesorts, and high cost estimates — these all point to indexing or statistics problems."

---

## Q5. What are the tradeoffs of indexing a high-write table?

**Answer:**

On write-heavy tables, indexes become a double-edged sword. Every index that speeds up reads also slows down every write.

**The write overhead:**
```sql
-- Table: events (10,000 inserts/sec, 5 indexes)
INSERT INTO events (user_id, type, payload, created_at) VALUES (...);

-- Behind the scenes, DB also does:
-- → Insert into idx_events_user_id
-- → Insert into idx_events_type
-- → Insert into idx_events_created_at
-- → Insert into idx_events_type_created_at
-- → Insert into idx_events_user_type
-- = 5 index writes per 1 row insert = 50,000 index ops/sec
```

**The real impact at scale:**

| # Indexes | Write throughput (relative) |
|---|---|
| 0 | 100% (baseline) |
| 2 | ~85% |
| 5 | ~65% |
| 10 | ~40% |

**Strategies to minimize write overhead:**

| Strategy | How it helps |
|---|---|
| Audit and drop unused indexes | Remove indexes nobody queries |
| Use partial indexes | Only index active/recent rows, not the whole table |
| Delay index creation for bulk loads | Drop indexes, bulk insert, rebuild after |
| Partition the table | Smaller partitions = smaller indexes = faster writes |
| Use async indexing | Write to DB without index, index separately (e.g. Elasticsearch) |

**How to audit write overhead (PostgreSQL):**
```sql
-- See which indexes are being written to vs read from
SELECT indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'events'
ORDER BY idx_scan ASC;
-- Low idx_scan + high write volume = index hurting more than helping
```

**One-liner for interviews:**
> "Every index adds a write penalty — on high-write tables I'd audit which indexes are actually read, drop unused ones, use partial indexes to limit scope, and consider async indexing patterns to decouple write and index throughput."

---

## Q6. What is a partial index and when would you use one?

**Answer:**

A partial index only indexes rows that **match a specific condition** — not the entire table. The result is a smaller, faster, more selective index.

```sql
-- Full index: indexes ALL 10 million users
CREATE INDEX idx_email ON users (email);

-- Partial index: only indexes the ~50,000 active users
CREATE INDEX idx_active_email ON users (email) WHERE is_active = true;
```

**Why partial indexes are better when applicable:**

| | Full Index | Partial Index |
|---|---|---|
| Size | Large (all rows) | Small (subset of rows) |
| Write overhead | Every insert/update | Only matching inserts/updates |
| Memory usage | High | Low (fits in buffer pool easier) |
| Selectivity | Lower | Higher |

**Best use cases:**

```sql
-- 1. Soft-deleted records: queries almost never touch deleted rows
CREATE INDEX idx_active_users ON users (email) WHERE deleted_at IS NULL;

-- 2. Pending queue: only a tiny fraction of orders are pending
CREATE INDEX idx_pending_orders ON orders (created_at) WHERE status = 'pending';

-- 3. Admin users: a small subset of all users
CREATE INDEX idx_admin_users ON users (last_login) WHERE role = 'admin';

-- 4. Unprocessed jobs: completed jobs are never queried
CREATE INDEX idx_pending_jobs ON jobs (priority, created_at) WHERE completed = false;
```

**Query must include the partial index condition:**
```sql
-- ✅ Planner can use the partial index
SELECT * FROM users WHERE email = 'x@x.com' AND is_active = true;

-- ❌ Planner cannot use it (doesn't guarantee is_active = true)
SELECT * FROM users WHERE email = 'x@x.com';
```

**One-liner for interviews:**
> "A partial index only covers rows matching a WHERE condition — it's smaller, faster, and cheaper to maintain than a full index. It's ideal when most queries only care about a predictable subset of rows."

---

## Q7. How do you design indexes for a query that filters AND sorts?

**Answer:**

When a query both filters and sorts, index column order is critical. A well-designed index eliminates both the filter scan and the sort step.

**The query:**
```sql
SELECT * FROM orders 
WHERE customer_id = 42          -- equality filter
ORDER BY created_at DESC        -- sort
LIMIT 20;
```

**Wrong index (sort column first):**
```sql
CREATE INDEX idx_wrong ON orders (created_at, customer_id);
-- This is globally sorted by created_at
-- To find customer 42's orders, DB still has to scan across all customers' dates
-- ❌ Filter not selective, sort not useful in the right scope
```

**Right index (filter column first, sort column last):**
```sql
CREATE INDEX idx_right ON orders (customer_id, created_at DESC);
-- 1. DB finds customer_id = 42 instantly (equality filter eliminates all other customers)
-- 2. Within customer 42's rows, data is already sorted by created_at DESC
-- ✅ No separate sort step needed — rows come out in the right order
```

**EXPLAIN confirms the difference:**
```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 20;

-- Bad index: Sort + Seq Scan or Index Scan with extra Sort node
-- Good index: Index Scan only — "sort" disappears from the plan
```

**General rules:**

```
Column order rule:
1. Equality filter columns → first (most selective, eliminates most rows)
2. Range filter column → second (e.g., BETWEEN, >, <)
3. ORDER BY / sort column → last (enables index scan without sort)

For DESC sorts: include DESC in the index definition to match
CREATE INDEX ON orders (customer_id, created_at DESC);
```

**One-liner for interviews:**
> "Put equality filter columns first and the sort/range column last — this lets the index eliminate rows by filter first, then deliver them already sorted, avoiding an extra sort operation entirely."

---

## Q8. What is index bloat and how do you fix it?

**Answer:**

Index bloat is when an index grows much larger than the actual data it represents. Dead entries pile up inside the index pages, making scans slower and wasting memory and disk.

**How bloat happens:**

```sql
-- Every DELETE leaves a dead entry in the index (tombstone)
DELETE FROM orders WHERE status = 'cancelled';
-- Index still holds the old (status='cancelled' → row pointer) entry
-- It's marked dead but not removed immediately

-- Every UPDATE on an indexed column = delete old + insert new
UPDATE users SET email = 'new@x.com' WHERE id = 1;
-- Old email entry becomes dead in the index
-- New email entry is inserted
-- Over time: lots of dead entries, few live ones
```

**Signs of index bloat:**

| Signal | How to check |
|---|---|
| Index size much larger than expected | `pg_size_pretty(pg_relation_size('idx_name'))` |
| Queries slowing despite index existing | EXPLAIN shows high cost on indexed query |
| `n_dead_tup` growing on table | `pg_stat_user_tables` |
| Autovacuum not keeping up | `pg_stat_user_tables.last_autovacuum` is old |

**Checking bloat in PostgreSQL:**
```sql
-- Check table dead tuples and index sizes
SELECT 
  relname AS table,
  n_live_tup,
  n_dead_tup,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname = 'orders';

-- Check individual index sizes
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'orders';
```

**Fixing bloat:**
```sql
-- PostgreSQL: VACUUM reclaims dead tuples (autovacuum does this automatically)
VACUUM orders;

-- VACUUM FULL: shrinks the file on disk (locks the table — use with caution)
VACUUM FULL orders;

-- Rebuild a specific bloated index without locking the table (Postgres 12+)
REINDEX INDEX CONCURRENTLY idx_orders_status;
```

```sql
-- MySQL: rebuilds the table and all its indexes
OPTIMIZE TABLE orders;
```

**Prevention:**
- Ensure autovacuum is running and tuned (`autovacuum_vacuum_scale_factor`)
- Monitor `n_dead_tup` regularly in production
- On very high-churn tables, tune autovacuum to run more aggressively

**One-liner for interviews:**
> "Index bloat happens when dead entries from deletes and updates accumulate inside the index over time. Fix it with REINDEX CONCURRENTLY for a specific index, or tune autovacuum to reclaim dead tuples more aggressively before bloat builds up."