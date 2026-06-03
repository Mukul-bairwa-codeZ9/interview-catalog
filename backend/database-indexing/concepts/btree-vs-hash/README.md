# B-Tree vs Hash Index

---

## Plain English Explanation

When a database creates an index, it needs to store it in a data structure.  
The two most common choices are **B-Tree** and **Hash**.

Think of it like two different ways to organize a phonebook:

- **B-Tree** → Like a sorted phonebook. You can find "Mukul", but you can also find everyone between "M" and "N" (range queries work).
- **Hash** → Like a locker system. You get a locker number from the name directly. Lightning fast for exact lookups, but useless for ranges.

---

## B-Tree Index

### What it is
B-Tree stands for **Balanced Tree**. It's the **default index type** in almost every database (PostgreSQL, MySQL, MongoDB, etc.).

### Structure
```
                    [30 | 70]                      ← Root node
                   /    |    \
          [10|20]    [40|60]    [80|90]            ← Internal nodes
          /  |  \    /  |  \    /  |  \
        [10][20][30][40][60][70][80][90][100]      ← Leaf nodes (actual pointers)
```

- The tree is always **balanced** — every leaf is at the same depth
- Each node holds **multiple keys** (not just 2 like a binary tree)
- Leaf nodes are **linked together** → makes range scans fast
- Lookup cost: **O(log n)**

### What queries it supports

| Query Type | Example | Supported? |
|---|---|---|
| Exact match | `WHERE age = 25` | ✅ Yes |
| Range | `WHERE age > 25` | ✅ Yes |
| Prefix match | `WHERE name LIKE 'Muk%'` | ✅ Yes |
| Sort / Order By | `ORDER BY age ASC` | ✅ Yes |
| Suffix match | `WHERE name LIKE '%kul'` | ❌ No |

### Why range queries work
Leaf nodes are linked in a chain. Once the DB finds the starting point, it just walks the chain to collect all matching rows — no need to go back up the tree.

```
Leaf chain: [10] → [20] → [30] → [40] → [50] → [60] → ...
Query: WHERE age BETWEEN 20 AND 50
→ Find 20 in tree → walk right until 50 → done ✅
```

---

## Hash Index

### What it is
A Hash index uses a **hash function** to map a column value directly to a bucket that contains the row pointer.

### Structure
```
Hash function:  hash("mukul@mail.com") → bucket 42

Buckets:
  bucket 42  → [ pointer to row ]
  bucket 17  → [ pointer to row ]
  bucket 89  → [ pointer to row ]
```

- Lookup cost: **O(1)** — faster than B-Tree for exact match
- But **no ordering** is preserved — hash("a") could be 999, hash("b") could be 3

### What queries it supports

| Query Type | Example | Supported? |
|---|---|---|
| Exact match | `WHERE email = 'x@y.com'` | ✅ Yes (O(1)) |
| Range | `WHERE age > 25` | ❌ No |
| Prefix match | `WHERE name LIKE 'Muk%'` | ❌ No |
| Sort / Order By | `ORDER BY age ASC` | ❌ No |

---

## Head-to-Head Comparison

| | B-Tree | Hash |
|---|---|---|
| Default index type | ✅ Yes | ❌ No (must specify) |
| Exact match speed | O(log n) | O(1) |
| Range queries | ✅ Yes | ❌ No |
| Sorting | ✅ Yes | ❌ No |
| LIKE 'prefix%' | ✅ Yes | ❌ No |
| Storage overhead | Medium | Low |
| Best use case | General purpose | Exact lookups only |

---

## When to Use Which

**Use B-Tree (default) when:**
- You run range queries (`>`, `<`, `BETWEEN`)
- You use `ORDER BY` or `GROUP BY` on the column
- You use `LIKE 'prefix%'` pattern matching
- You're unsure — B-Tree is the safe default

**Use Hash when:**
- You only do **exact equality** checks (`=`)
- The column has very high cardinality (e.g. UUIDs, session tokens)
- You need the absolute fastest point lookup and never do ranges
- Example: session store lookups by session ID

---

## Real World Example

```sql
-- B-Tree shines here (range + sort)
SELECT * FROM orders
WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY created_at DESC;

-- Hash shines here (exact lookup only)
SELECT * FROM sessions
WHERE session_token = 'abc123xyz';
```

---

## MongoDB Equivalent

MongoDB uses B-Tree indexes by default (called just "indexes").  
It does not support Hash indexes the same way — instead it uses **hashed indexes** specifically for sharding (distributing data across nodes), not for general query optimization.

```js
// MongoDB B-Tree index (default) — supports range, sort
db.users.createIndex({ age: 1 })

// MongoDB hashed index — for sharding only, exact match only
db.users.createIndex({ _id: "hashed" })
```

---

## Interview Answer Template

**Q: What is the difference between a B-Tree and a Hash index?**

> "A B-Tree index stores data in a balanced tree structure where leaf nodes are linked together, enabling O(log n) lookups and supporting range queries, sorting, and prefix matching. A Hash index uses a hash function to map values directly to buckets, giving O(1) exact lookups but with no support for range queries or ordering. B-Tree is the default and handles most use cases well. Hash indexes are only useful when you exclusively do exact equality lookups and never need ranges — like looking up a session token or a UUID. In practice, I'd default to B-Tree unless I have a specific, proven need for hash."

---

## Key Terms to Remember

| Term | Meaning |
|---|---|
| B-Tree | Balanced tree — default index, supports range + sort |
| Leaf node | Bottom level of B-Tree — holds actual row pointers |
| Linked leaf nodes | What makes range scans fast in B-Tree |
| Hash function | Maps a value to a bucket number |
| Hash collision | Two values hash to same bucket — handled with chaining |
| O(log n) | B-Tree lookup cost |
| O(1) | Hash lookup cost (exact match) |