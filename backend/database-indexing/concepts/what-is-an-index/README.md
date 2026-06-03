# What is a Database Index?

---

## Plain English Explanation

Imagine a book with 1000 pages. If you want to find the word "indexing", you have two choices:

1. **Read every single page** until you find it → slow
2. **Check the index at the back of the book** → jump directly to the right page → fast

A database index works exactly the same way.

Without an index, the database reads **every row** in a table to find what you need.  
With an index, it jumps **directly** to the matching rows.

---

## How a Database Finds Rows — Without an Index

```
SELECT * FROM users WHERE email = 'mukul@example.com';
```

Without an index on `email`:
```
Row 1 → check email → no match
Row 2 → check email → no match
Row 3 → check email → no match
...
Row 10,000 → check email → MATCH ✅
```

This is called a **Full Table Scan**.  
Cost: O(n) — every row is read.

---

## How a Database Finds Rows — With an Index

With an index on `email`, the DB maintains a separate, sorted data structure.

```
Index on email:
  aaron@example.com  → Row 45
  bob@example.com    → Row 12
  mukul@example.com  → Row 9823   ← jump directly here
  ...
```

The DB looks up the index → gets the exact row location → fetches it directly.  
Cost: O(log n) — much faster.

---

## What Does an Index Actually Look Like Internally?

Most indexes are stored as a **B-Tree** (covered in next concept).

The index stores:
- The **indexed column value** (e.g. the email)
- A **pointer** to the actual row on disk (called a Row ID or heap pointer)

The DB uses the index to find the pointer, then fetches the actual row.

---

## Clustered vs Non-Clustered Index

This is one of the most common interview questions on this topic.

### Clustered Index

- The **actual table data is stored in the order of the index**
- Only **one** clustered index per table (the data can only be sorted one way)
- In most databases, the **Primary Key is the clustered index by default**

```
Table data physically stored by user_id order:
user_id=1  → { name: "Alice", email: "..." }
user_id=2  → { name: "Bob",   email: "..." }
user_id=3  → { name: "Mukul", email: "..." }
```

Lookup by `user_id` is extremely fast — no extra pointer hop needed.

### Non-Clustered Index

- A **separate structure** that stores the indexed value + a pointer to the actual row
- You can have **many** non-clustered indexes per table
- Requires an **extra hop**: index lookup → pointer → fetch actual row

```
Non-clustered index on email:
  aaron@example.com  → pointer → go fetch row from disk
  mukul@example.com  → pointer → go fetch row from disk
```

### Quick Comparison

| | Clustered | Non-Clustered |
|---|---|---|
| Data storage | Data IS the index | Separate structure |
| Count per table | Only 1 | Many |
| Speed | Fastest (no extra hop) | Fast (one extra hop) |
| Default | Primary Key | Any other column |
| Example | `user_id` lookup | `email`, `username` lookup |

---

## When Should You Add an Index?

✅ Add an index when:
- Column is used frequently in `WHERE`, `JOIN`, `ORDER BY`
- Column has **high cardinality** (many unique values — e.g. email, user_id)

❌ Don't add an index when:
- Table is very small (full scan is fine)
- Column has **low cardinality** (e.g. `status` with only 3 values)
- Column is written to very frequently (indexes slow down writes)

---

## Interview Answer Template

**Q: What is a database index and how does it work?**

> "A database index is a separate data structure that allows the database to find rows faster without scanning the entire table. It works similarly to a book index — you look up the value in the index, get a pointer to the exact location, and fetch the data directly. Most indexes are implemented as B-Trees, giving O(log n) lookup instead of O(n) full table scans. There are two main types — clustered indexes, where the data is physically sorted by the index (usually the primary key), and non-clustered indexes, which are separate structures with pointers back to the actual rows. The tradeoff is that indexes speed up reads but slow down writes since the index must be updated on every insert, update, or delete."

---

## Key Terms to Remember

| Term | Meaning |
|---|---|
| Full Table Scan | Reading every row to find matches |
| Clustered Index | Data physically ordered by this index |
| Non-Clustered Index | Separate structure with pointer to row |
| Cardinality | Number of unique values in a column |
| Heap | The actual table data storage |
| Row ID / Pointer | Address of the actual row on disk |