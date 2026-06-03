# Composite Indexes

---

## Plain English Explanation

A composite index (also called a multi-column index) is an index on **more than one column**.

Think of it like a phone book sorted by **Last Name, then First Name**.

- You can quickly find everyone with last name "Smith" ✅
- You can quickly find "Smith, John" ✅
- But you **cannot** quickly find everyone named "John" without scanning the whole book ❌

That's the **left-prefix rule** — and it's the most tested concept in interviews.

---

## What is a Composite Index?

```sql
-- Single column index
CREATE INDEX idx_last_name ON users(last_name);

-- Composite index on two columns
CREATE INDEX idx_name ON users(last_name, first_name);

-- Composite index on three columns
CREATE INDEX idx_search ON orders(user_id, status, created_at);
```

The index is sorted **first by the leftmost column**, then by the next, and so on.

```
Index on (last_name, first_name):

  Brown, Alice
  Brown, Bob
  Brown, Charlie
  Smith, Alice     ← sorted by last_name first
  Smith, John
  Smith, Zara
  Wilson, Bob
```

---

## The Left-Prefix Rule

This is the **#1 thing interviewers test** about composite indexes.

**Rule: A composite index can only be used if the query includes the leftmost column(s) of the index.**

Given index on `(a, b, c)`:

| Query | Uses Index? | Why |
|---|---|---|
| `WHERE a = 1` | ✅ Yes | Uses leftmost prefix `(a)` |
| `WHERE a = 1 AND b = 2` | ✅ Yes | Uses prefix `(a, b)` |
| `WHERE a = 1 AND b = 2 AND c = 3` | ✅ Full index used | All columns |
| `WHERE b = 2` | ❌ No | Skips `a` — no left prefix |
| `WHERE c = 3` | ❌ No | Skips `a` and `b` |
| `WHERE a = 1 AND c = 3` | ⚠️ Partial | Uses `a` only, `c` not helped |
| `WHERE b = 2 AND c = 3` | ❌ No | Skips `a` |

---

## Column Order Matters — (a, b) ≠ (b, a)

The order you define the columns in the index is critical.

```sql
-- Index 1: (user_id, status)
CREATE INDEX idx1 ON orders(user_id, status);

-- Index 2: (status, user_id)
CREATE INDEX idx2 ON orders(status, user_id);
```

```sql
-- This query uses idx1 efficiently (left prefix = user_id)
SELECT * FROM orders WHERE user_id = 42;

-- This query uses idx2 efficiently (left prefix = status)
SELECT * FROM orders WHERE status = 'pending';

-- This query uses BOTH idx1 and idx2 (both columns present)
SELECT * FROM orders WHERE user_id = 42 AND status = 'pending';
```

**Rule of thumb for column ordering:**
1. Put the **most selective** column first (highest cardinality — e.g. user_id)
2. Put columns used in **equality checks** before **range checks**
3. Put columns used in **ORDER BY** at the end

---

## Equality Before Range Rule

This catches a lot of people in interviews.

```sql
-- Index on (status, created_at)
CREATE INDEX idx ON orders(status, created_at);

-- Query
SELECT * FROM orders
WHERE status = 'pending'       -- equality
AND created_at > '2024-01-01'; -- range
```

This works well ✅ — equality column first, range column second.

```sql
-- Index on (created_at, status)  ← WRONG ORDER
CREATE INDEX idx ON orders(created_at, status);

-- Same query
SELECT * FROM orders
WHERE status = 'pending'
AND created_at > '2024-01-01';
```

This is inefficient ❌ — range column first means the DB can't use `status` from the index after the range.

**Golden rule: equality columns → range columns in your composite index.**

---

## Composite Index vs Multiple Single Indexes

| | Composite Index | Multiple Single Indexes |
|---|---|---|
| Multi-column query | ✅ Very efficient | ⚠️ DB picks one, filters rest |
| Single column query | ✅ If left-prefix matches | ✅ Direct |
| Storage | One structure | Multiple structures |
| Write overhead | One update | Multiple updates |
| Best for | Known query patterns | Ad-hoc queries |

---

## Real World Example

```sql
-- Table: orders(id, user_id, status, created_at, total)

-- Common queries:
-- 1. Find all orders for a user
-- 2. Find pending orders for a user
-- 3. Find recent orders for a user

-- Best composite index for these patterns:
CREATE INDEX idx_orders ON orders(user_id, status, created_at);

-- Query 1: uses (user_id) prefix ✅
SELECT * FROM orders WHERE user_id = 42;

-- Query 2: uses (user_id, status) prefix ✅
SELECT * FROM orders WHERE user_id = 42 AND status = 'pending';

-- Query 3: uses full index ✅
SELECT * FROM orders WHERE user_id = 42 AND status = 'pending'
ORDER BY created_at DESC;
```

---

## MongoDB Composite Index

```js
// Create composite index
db.orders.createIndex({ user_id: 1, status: 1, created_at: -1 })

// Uses index (left prefix: user_id)
db.orders.find({ user_id: 42 })

// Uses index (user_id + status)
db.orders.find({ user_id: 42, status: "pending" })

// Does NOT use index (skips user_id)
db.orders.find({ status: "pending" })
```

---

## Interview Answer Template

**Q: What is a composite index and what is the left-prefix rule?**

> "A composite index is an index on multiple columns. The database sorts the index first by the leftmost column, then by subsequent columns — similar to how a phone book sorts by last name then first name. The left-prefix rule means the index can only be used if the query includes the leftmost column of the index. For example, an index on (a, b, c) helps queries filtering on a, or a+b, or a+b+c — but not queries that skip a and filter only on b or c. Column order in a composite index also matters: equality-check columns should come before range-check columns, and higher-cardinality columns should generally come first to maximize selectivity."

---

## Key Terms to Remember

| Term | Meaning |
|---|---|
| Composite index | Index on multiple columns |
| Left-prefix rule | Query must include leftmost column(s) to use the index |
| Cardinality | Uniqueness of values — higher = more selective |
| Selectivity | How well an index narrows down results |
| Equality before range | Put `=` columns before `>/<` columns in index |
| Index scan | DB uses the index to find rows |
| Full table scan | DB reads all rows — index not used |