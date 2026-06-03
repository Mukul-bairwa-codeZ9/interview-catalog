# Covering Indexes

---

## Plain English Explanation

Normally when a database uses an index, it does two steps:

1. **Look up the index** → get a pointer to the row
2. **Follow the pointer** → fetch the actual row from the table (heap lookup)

A **covering index** eliminates step 2 entirely.

If the index already contains **all the columns the query needs**, the database never has to touch the actual table. It reads everything straight from the index.

Think of it like this:
- Normal index → index is a table of contents → still need to go read the chapter
- Covering index → index IS the chapter → you're done right there

---

## How a Normal Index Works (Two Hops)

```sql
CREATE INDEX idx_email ON users(email);

SELECT name, age FROM users WHERE email = 'mukul@mail.com';
```

Steps the DB takes:
```
Step 1: Look up index on email
        → finds pointer to Row #9823

Step 2: Go to Row #9823 in the table (heap)
        → fetch name, age from the full row

Total: 2 hops
```

The second hop (heap lookup) is expensive — it's a random disk read.

---

## How a Covering Index Works (One Hop)

```sql
CREATE INDEX idx_covering ON users(email, name, age);

SELECT name, age FROM users WHERE email = 'mukul@mail.com';
```

Steps the DB takes:
```
Step 1: Look up index on email
        → index already has name and age right there!
        → return directly, no table lookup needed

Total: 1 hop — index-only scan ✅
```

The index "covers" the query because it has every column the query needs.

---

## What Makes an Index "Covering"?

An index covers a query when it contains **all** of the following:

| What the query needs | Must be in index? |
|---|---|
| Columns in `WHERE` clause | ✅ Yes (for filtering) |
| Columns in `SELECT` clause | ✅ Yes (to avoid heap lookup) |
| Columns in `ORDER BY` | ✅ Yes (to avoid sort step) |
| Columns in `JOIN` condition | ✅ Yes |

If any column the query touches is **not** in the index → DB falls back to heap lookup.

---

## Visual: Normal vs Covering Index

```
Normal Index:
┌──────────────────┐          ┌─────────────────────────┐
│   Index          │  ptr →   │   Table (heap)           │
│  email           │ ──────►  │  id | email | name | age │
│  mukul@mail.com  │          │  ... | mukul@... | Mukul | 25│
└──────────────────┘          └─────────────────────────┘
       Hop 1                          Hop 2 (expensive)

Covering Index:
┌──────────────────────────────────┐
│   Index (has everything needed)  │
│  email           | name  | age   │
│  mukul@mail.com  | Mukul | 25    │  ← query answered here, done!
└──────────────────────────────────┘
       Hop 1 only ✅
```

---

## When to Use Covering Indexes

✅ **Great use cases:**
- High-frequency read queries on large tables
- Queries that `SELECT` only a few specific columns (not `SELECT *`)
- Reporting queries that run often and need to be fast
- APIs returning the same fixed set of fields repeatedly

```sql
-- Perfect candidate for covering index
-- Always queries these exact 3 columns
SELECT user_id, status, created_at
FROM orders
WHERE user_id = 42
ORDER BY created_at DESC;

-- Covering index: (user_id, status, created_at)
CREATE INDEX idx_cov ON orders(user_id, status, created_at);
```

❌ **Bad use cases:**
- Queries using `SELECT *` — covering index can't help, table has too many columns
- Rarely run queries — overhead not worth it
- Tables with heavy writes — every write must update the index

---

## The Tradeoff

| | Benefit | Cost |
|---|---|---|
| Covering index | Eliminates heap lookup → faster reads | Larger index size, slower writes |
| Normal index | Smaller, cheaper to maintain | Extra heap lookup on reads |

Covering indexes make reads faster by moving more data into the index — so the index grows bigger and writes become slightly more expensive (index must be updated with more columns).

---

## SELECT * Kills Covering Indexes

This is a common interview trap:

```sql
-- This CAN use a covering index
SELECT user_id, status FROM orders WHERE user_id = 42;

-- This CANNOT — * means every column must come from the table
SELECT * FROM orders WHERE user_id = 42;
```

`SELECT *` always requires a heap lookup because no index stores every column. This is one reason why `SELECT *` is discouraged in production queries.

---

## MongoDB Equivalent

In MongoDB, a covered query is one where all fields are in the index — including the fields being returned (projection).

```js
// Create covering index
db.orders.createIndex({ user_id: 1, status: 1, created_at: -1 })

// Covered query — projection only includes indexed fields
// MongoDB won't touch the actual documents
db.orders.find(
  { user_id: 42 },
  { user_id: 1, status: 1, created_at: 1, _id: 0 }  // only indexed fields
)

// NOT covered — 'total' is not in the index → heap lookup needed
db.orders.find(
  { user_id: 42 },
  { user_id: 1, status: 1, total: 1 }
)
```

**Key MongoDB rule:** To get a covered query, the projection must exclude `_id` (or include it in the index) since `_id` is not in your custom index.

---

## Interview Answer Template

**Q: What is a covering index and when would you use one?**

> "A covering index is an index that contains all the columns a query needs — the filter columns, the selected columns, and any sort columns. When a query is covered by an index, the database can answer it entirely from the index without touching the actual table rows, which eliminates an expensive random heap lookup. This is called an index-only scan. I'd use a covering index for high-frequency read queries that always select the same specific set of columns — for example, an API endpoint that always returns user_id, status, and created_at from an orders table. The tradeoff is that the index stores more data, so it's larger and writes are slightly slower. It's also useless for SELECT * queries since the index can never contain every column."

---

## Key Terms to Remember

| Term | Meaning |
|---|---|
| Covering index | Index containing all columns a query needs |
| Index-only scan | Query answered from index alone — no heap lookup |
| Heap lookup | Fetching the actual row from the table using a pointer |
| Heap | The actual table data storage on disk |
| Projection | The columns you SELECT — must be in index for coverage |
| SELECT * | Always causes heap lookup — breaks covering index |