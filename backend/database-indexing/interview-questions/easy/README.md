# Database Indexing — Easy Interview Questions

---

## Q1. What is a database index and why do we use it?

**Answer:**

An index is a separate data structure that stores a small, sorted subset of your table's data — usually one or more columns — so the database can find rows fast without reading every row.

**Without an index — full table scan:**
```sql
-- No index on email: DB reads every row to find a match
SELECT * FROM users WHERE email = 'mukul@example.com';
-- 1,000,000 rows examined → slow
```

**With an index — direct lookup:**
```sql
CREATE INDEX idx_users_email ON users (email);
-- DB jumps straight to the matching row
-- ~log(n) rows examined → fast
```

**How it works internally:**
- Index stores `(indexed_value → row pointer)` pairs, sorted
- Database traverses the index structure to find the value
- Then follows the pointer to fetch the actual row

**The trade-off:**

| | Without Index | With Index |
|---|---|---|
| Read speed | Slow (full scan) | Fast (direct lookup) |
| Write speed | Fast | Slower (index must update) |
| Storage | None | Extra disk space |

**Analogy:** A book's index at the back. Instead of reading every page to find "binary search", you look it up and jump to page 94 directly.

**One-liner for interviews:**
> "An index is a data structure that lets the database find rows without scanning the whole table — it speeds up reads at the cost of slower writes and extra storage."

---

## Q2. How does a B-Tree index work?

**Answer:**

A B-Tree (Balanced Tree) is the default index structure in most databases (PostgreSQL, MySQL). It organizes indexed values in a sorted tree so the database can find any value in O(log n) steps.

**Structure:**
```
                  [50]                    ← Root node
                /       \
           [25]           [75]            ← Internal nodes
          /    \          /    \
      [10,20] [30,40] [60,70] [80,90]    ← Leaf nodes (hold row pointers)
```

- **Root + Internal nodes** → guide the search left or right
- **Leaf nodes** → hold the actual indexed values + pointers to table rows
- **All paths root → leaf are equal length** → always balanced → always O(log n)

**Query walkthrough:**
```sql
SELECT * FROM users WHERE age = 30;
-- 1. Start at root: is 30 < 50? Go left
-- 2. At node [25]: is 30 > 25? Go right
-- 3. At leaf [30,40]: found 30 → follow pointer → fetch row
-- Total: 3 steps instead of scanning 1,000,000 rows
```

**Why B-Tree supports range queries:**
Because data is sorted, range queries (`BETWEEN`, `>`, `<`, `ORDER BY`) work efficiently — the DB finds the start point, then reads sequentially along leaf nodes.

```sql
-- Works great with B-Tree: finds start of range, reads forward
SELECT * FROM orders WHERE created_at BETWEEN '2024-01-01' AND '2024-03-01';
```

**One-liner for interviews:**
> "A B-Tree index is a sorted, balanced tree that gives O(log n) lookups and also supports range queries because data is stored in order — that's why it's the default index type."

---

## Q3. What is the difference between a clustered and a non-clustered index?

**Answer:**

The key difference is whether the **table rows are physically stored** inside the index or separately.

**Clustered index:**
- Table rows are stored **in the same order** as the index
- The index leaf nodes **contain the actual row data** (not just pointers)
- Only **one per table** — you can't physically sort a table two ways at once
- In MySQL InnoDB, the primary key is always the clustered index

```sql
-- In MySQL: rows are physically ordered by id
CREATE TABLE users (
  id INT PRIMARY KEY,   -- ← this IS the clustered index
  name VARCHAR(100),
  email VARCHAR(100)
);
```

**Non-clustered index:**
- Index stored **separately** from the table
- Leaf nodes contain the indexed value + a **pointer back to the row**
- Many allowed per table
- Requires an extra hop to fetch the full row (called a **key lookup** or **heap fetch**)

```sql
-- Non-clustered: stores (email → pointer to row)
CREATE INDEX idx_email ON users (email);
-- To get full row: find email in index → follow pointer → fetch row from table
```

**Comparison:**

| | Clustered | Non-Clustered |
|---|---|---|
| Row storage | Inside the index | Separate from index |
| Count per table | 1 only | Many |
| Read speed | Fastest (no extra hop) | Slightly slower (pointer hop) |
| Typical use | Primary key | All other indexes |

**One-liner for interviews:**
> "A clustered index defines how rows are physically stored — you can only have one. Non-clustered indexes are separate structures with pointers back to the actual rows, and you can have many."

---

## Q4. What is a composite index?

**Answer:**

A composite index (multi-column index) is an index built on **two or more columns together**.

```sql
CREATE INDEX idx_name_dept ON employees (last_name, department, hire_date);
```

This is useful when queries frequently filter or sort by multiple columns together — a single-column index on `last_name` alone can't help a query that also filters by `department`.

**The left-prefix rule — critical concept:**

The index is built sorted by `last_name` first, then `department` within each last_name, then `hire_date`. The database can only use the index from the **leftmost column forward**:

```sql
-- ✅ Uses index fully
SELECT * FROM employees WHERE last_name = 'Smith' AND department = 'Engineering';

-- ✅ Uses index partially (last_name only)
SELECT * FROM employees WHERE last_name = 'Smith';

-- ❌ Cannot use index — skips leftmost column
SELECT * FROM employees WHERE department = 'Engineering';

-- ❌ Cannot use index — skips to middle
SELECT * FROM employees WHERE hire_date > '2023-01-01';
```

**Practical design rule:**
- Put the most-filtered column **first** (highest selectivity)
- Put range query columns **last**
- Think about which queries need to use this index together

**One-liner for interviews:**
> "A composite index covers multiple columns and uses the left-prefix rule — queries must include columns from the left side of the index definition, otherwise the index won't be used."

---

## Q5. When should you NOT add an index?

**Answer:**

Indexes are not always beneficial. The read speedup must outweigh the write slowdown and storage cost.

**Do NOT index when:**

**1. The table is small:**
```sql
-- 500-row table: full scan takes microseconds
-- Index adds overhead with no real benefit
-- Query planner will often ignore the index anyway
```

**2. The column has low selectivity (low cardinality):**
```sql
-- BAD: only 2 values — index returns half the table
CREATE INDEX idx_gender ON users (gender);  -- 'M' or 'F'

-- BAD: only true/false — not selective enough
CREATE INDEX idx_active ON users (is_active);
```

**3. The table is write-heavy with few reads:**
```sql
-- Logs/events table: 50,000 inserts/sec, rarely queried
-- Each insert updates every index → indexes become a write bottleneck
```

**4. The column is rarely used in queries:**
```sql
-- Indexing a column that appears in WHERE once a month
-- Maintains the index on every write for almost zero read benefit
```

**The selectivity rule of thumb:**
```
Selectivity = distinct values / total rows

email:     1,000,000 / 1,000,000 = 1.0   ✅ Great index candidate
country:   195 / 1,000,000 = 0.000195     ⚠️  Depends on query
is_active: 2 / 1,000,000 = 0.000002       ❌ Bad index candidate
```

**One-liner for interviews:**
> "Don't index small tables, low-cardinality columns, or tables with far more writes than reads — the maintenance cost of the index outweighs its read benefit."

---

## Q6. What is index selectivity and why does it matter?

**Answer:**

Selectivity measures how unique the values in an indexed column are. It tells you how well an index can narrow down results.

```
Selectivity = number of distinct values / total rows
Range: 0.0 (completely non-selective) → 1.0 (perfectly selective)
```

**Examples on a 1,000,000-row users table:**

| Column | Distinct values | Selectivity | Index useful? |
|---|---|---|---|
| `user_id` | 1,000,000 | 1.0 | ✅ Perfect |
| `email` | 1,000,000 | 1.0 | ✅ Perfect |
| `country` | 195 | 0.000195 | ⚠️ Depends |
| `status` | 5 | 0.000005 | ❌ Poor |
| `is_deleted` | 2 | 0.000002 | ❌ Useless |

**Why it matters to the query planner:**

If selectivity is low, the index would return hundreds of thousands of rows. Following that many row pointers is actually **slower** than just scanning the table sequentially — so the query planner skips the index entirely:

```sql
-- Planner may ignore this index if 90% of rows have is_active = true
SELECT * FROM users WHERE is_active = true;
-- Seq Scan faster than: find 900K entries in index → follow 900K pointers
```

**Fix for low-selectivity columns — use a partial index instead:**
```sql
-- Only index the rare case (inactive users = small subset)
CREATE INDEX idx_inactive ON users (user_id) WHERE is_active = false;
```

**One-liner for interviews:**
> "Selectivity measures how unique column values are — high selectivity means the index eliminates most rows and is very useful. Low selectivity means it returns too many rows and the planner may skip it entirely."

---

## Q7. What is the difference between a Hash index and a B-Tree index?

**Answer:**

Both are index types but work completely differently and suit different query patterns.

**How they work:**

```
B-Tree:              Hash:
     [50]            key → hash(key) → bucket → row pointer
    /    \
  [25]  [75]         hash('mukul@x.com') → bucket 4821 → row
 /   \  /   \        Lookup: O(1) — direct jump
[10][30][60][80]     No ordering preserved
Lookup: O(log n)
Data is sorted
```

**Side-by-side comparison:**

| Feature | B-Tree | Hash |
|---|---|---|
| Equality (`=`) | ✅ Fast | ✅ Faster (O(1)) |
| Range (`BETWEEN`, `>`, `<`) | ✅ Supported | ❌ Not supported |
| Sorting (`ORDER BY`) | ✅ Supported | ❌ Not supported |
| Prefix search (`LIKE 'abc%'`) | ✅ Supported | ❌ Not supported |
| Default index type | ✅ Yes | ❌ No |

**When Hash is better:**
```sql
-- Pure equality lookups on a unique key — Hash wins
SELECT * FROM sessions WHERE session_token = 'abc123xyz';
```

**Why B-Tree is almost always preferred:**
```sql
-- Hash can't do this — ordering is destroyed by hashing
SELECT * FROM orders WHERE created_at BETWEEN '2024-01-01' AND '2024-06-01';
SELECT * FROM users ORDER BY last_name;
```

**One-liner for interviews:**
> "Hash indexes give O(1) exact-match lookups but can't do range queries or sorting because hashing destroys order. B-Tree is slightly slower for equality but works for everything — so it's the default."

---

## Q8. How does adding an index affect INSERT, UPDATE, and DELETE performance?

**Answer:**

Every write to a table must keep **all indexes on that table up to date** — there's no free lunch.

**What happens on each write:**

```sql
-- INSERT: new entry added to every index
INSERT INTO users (id, name, email) VALUES (1001, 'Mukul', 'mukul@x.com');
-- → updates idx_users_email, idx_users_name, idx_users_created_at, etc.

-- DELETE: entry removed from every index
DELETE FROM users WHERE id = 1001;
-- → removes entry from every index on users

-- UPDATE on indexed column: old entry removed + new entry added
UPDATE users SET email = 'new@x.com' WHERE id = 1001;
-- → deletes old email entry from index, inserts new email entry
```

**The math:**
```
1 table with 8 indexes
→ 1 INSERT = 8 index write operations
→ 10,000 inserts/sec = 80,000 index operations/sec
```

**Real-world impact:**

| Scenario | Effect |
|---|---|
| Read-heavy table (product catalog) | Many indexes are fine — writes are infrequent |
| Write-heavy table (event logs, metrics) | Keep indexes minimal — every index hurts throughput |
| Bulk import of 10M rows | Drop indexes first, rebuild after — much faster |

**Signs you have too many indexes:**
- Write throughput drops under load
- `INSERT` queries taking longer than expected
- CPU/IO spikes during batch write jobs

**One-liner for interviews:**
> "Every index on a table adds overhead to every write — INSERT, UPDATE, and DELETE all must update each index. More indexes means slower writes, so on write-heavy tables, keep indexes lean."