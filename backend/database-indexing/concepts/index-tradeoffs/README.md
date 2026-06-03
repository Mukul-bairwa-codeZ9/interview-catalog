# Index Tradeoffs

---

## Plain English Explanation

Indexes are not free. Every index you add makes **reads faster** but makes **writes slower** and uses **more storage**.

Think of it like maintaining a book index:
- When you write a new chapter, you also have to **update the index at the back**
- The more indexes (subject index, author index, keyword index), the more updating you do every time content changes

Knowing **when NOT to index** is just as important as knowing when to index — and interviewers love testing this.

---

## The Core Tradeoff

```
More indexes  →  Faster reads,  Slower writes,  More storage
Fewer indexes →  Slower reads,  Faster writes,  Less storage
```

There is no free lunch. Every index is a deliberate tradeoff.

---

## Tradeoff 1 — Write Overhead

Every `INSERT`, `UPDATE`, or `DELETE` must update **all indexes** on that table.

```
Table: orders  with 4 indexes

INSERT one row →
  Write row to table          (1 write)
  Update idx_user_id          (1 write)
  Update idx_status           (1 write)
  Update idx_created_at       (1 write)
  Update idx_composite        (1 write)
  ─────────────────────────
  Total: 5 writes for 1 insert 😬
```

On a write-heavy table, this adds up fast.

**UPDATE is the most expensive** — if the updated column is indexed, the DB must:
1. Remove the old value from the index
2. Insert the new value into the index
3. Rebalance the B-Tree if needed

---

## Tradeoff 2 — Storage Cost

Each index is a separate data structure stored on disk. More indexes = more disk space.

```
Table: users  (10 million rows, ~2 GB)

Index on email     → ~400 MB
Index on username  → ~350 MB
Index on city      → ~200 MB
─────────────────────────────
Total indexes      → ~950 MB extra

Total storage: 2 GB + 0.95 GB = ~3 GB
```

Storage cost compounds fast at scale. Indexes can sometimes be **larger than the table itself**.

---

## Tradeoff 3 — Index Maintenance Overhead

B-Trees need to stay balanced. As data grows:
- **Page splits** happen when a B-Tree node fills up → expensive reorganization
- **Index bloat** occurs when deletes leave gaps → wasted space
- **Vacuuming / rebuilding** is periodically needed in production databases

---

## When NOT to Index

This is what interviewers really want to hear.

### ❌ Low Cardinality Columns

```sql
-- BAD: status has only 3 values (pending, active, cancelled)
-- An index here barely helps — DB still reads ~33% of the table
CREATE INDEX idx_status ON orders(status);  -- ❌ usually not worth it
```

**Rule:** If a column has fewer than ~10-20 distinct values, an index often hurts more than it helps. The DB query planner may ignore it anyway.

### ❌ Small Tables

```sql
-- BAD: table has only 500 rows
-- Full table scan is faster than index lookup + heap fetch
CREATE INDEX idx_name ON config(name);  -- ❌ overkill
```

For small tables, a full scan is trivial. Index overhead (lookup + pointer follow) is actually slower.

### ❌ Write-Heavy Tables (High Churn)

```sql
-- BAD: events table gets millions of inserts per minute
-- Every insert updates every index → massive write bottleneck
CREATE INDEX idx_event_type ON events(event_type);  -- ❌ think carefully
```

Logging tables, event streams, audit tables — often better to avoid indexes and use batch reads.

### ❌ Columns Rarely Used in Queries

```sql
-- BAD: middle_name is almost never queried
CREATE INDEX idx_middle_name ON users(middle_name);  -- ❌ dead weight
```

Unused indexes still slow down writes. Always drop indexes that aren't being used.

### ❌ SELECT * Queries Dominate

If your app always does `SELECT *`, adding a covering index is pointless — it'll never achieve index-only scans.

---

## When TO Index — Quick Reference

| Scenario | Index? | Why |
|---|---|---|
| Primary key | ✅ Always | Default, unique, high cardinality |
| Foreign keys | ✅ Yes | JOIN performance |
| Columns in WHERE frequently | ✅ Yes | Filtering |
| Columns in ORDER BY | ✅ Yes | Avoid sort step |
| High cardinality column | ✅ Yes | Selective |
| Low cardinality (e.g. boolean) | ❌ No | Not selective enough |
| Small table (<1000 rows) | ❌ No | Full scan is fine |
| Write-heavy column (logs) | ❌ Careful | Write overhead |
| Column never queried | ❌ No | Dead weight |

---

## The Over-Indexing Problem

Adding too many indexes is a real production issue:

```
Symptom: Writes are getting slower and slower over time
Cause:   Dev added indexes for every query without removing old ones
Result:  Each insert/update touches 8+ indexes → write throughput tanks
Fix:     Audit indexes, drop unused ones, consolidate into composite indexes
```

**How to find unused indexes:**

```sql
-- PostgreSQL: find indexes never used since last stats reset
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- MongoDB: find indexes with zero usage
db.orders.aggregate([{ $indexStats: {} }])
```

---

## The Sweet Spot — Index Strategy

```
1. Start with primary key index (automatic)
2. Add indexes for foreign keys (JOIN columns)
3. Add indexes for your most frequent, slowest queries
4. Measure — use EXPLAIN ANALYZE to verify index is used
5. Review periodically — drop unused indexes
6. Never add indexes speculatively — let query patterns guide you
```

---

## MongoDB Tradeoffs

```js
// MongoDB also pays write overhead per index
// Each insert must update all indexes on the collection

// Check index usage stats
db.orders.aggregate([{ $indexStats: {} }])

// Drop an unused index
db.orders.dropIndex("idx_name")

// See all indexes and their sizes
db.orders.stats().indexSizes
```

---

## Interview Answer Template

**Q: What are the tradeoffs of database indexes?**

> "Indexes improve read performance but come with three main costs. First, write overhead — every INSERT, UPDATE, and DELETE must update all indexes on the table, so more indexes means slower writes. Second, storage — each index is a separate data structure on disk that can be nearly as large as the table itself. Third, maintenance — B-Trees need periodic rebalancing and vacuuming as data changes. Because of this, I wouldn't add indexes blindly. I'd avoid indexing low-cardinality columns like boolean flags or status fields with few values, small tables where a full scan is faster, and write-heavy tables like event logs. I'd use EXPLAIN ANALYZE to confirm an index is actually being used, and periodically audit for unused indexes to drop them. The goal is the minimum set of indexes that covers your most critical query patterns."

---

## Key Terms to Remember

| Term | Meaning |
|---|---|
| Write overhead | Extra writes needed to keep indexes updated |
| Page split | B-Tree node full → splits into two → expensive |
| Index bloat | Deleted rows leave gaps → wasted index space |
| Cardinality | Number of unique values — low cardinality = bad index candidate |
| Dead index | An index that exists but is never used by the query planner |
| EXPLAIN ANALYZE | SQL command to see if/how an index is being used |
| Over-indexing | Too many indexes → write throughput degrades |
| Vacuum | Process to reclaim space from dead index entries (PostgreSQL) |