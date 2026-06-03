# Database Indexing

A structured, interview-focused module on database indexing — one of the most frequently tested backend topics in software engineering interviews.

---

## Why This Matters in Interviews

Indexing questions show up across all levels — from "what is an index" at entry level to "design an indexing strategy for this schema" at senior level. Interviewers use this topic to test:

- Your understanding of how databases work under the hood
- Your ability to reason about performance tradeoffs
- Your experience with real query optimization

---

## What This Module Covers

| Concept | Description |
|---|---|
| **What is an Index** | How indexes work internally, clustered vs non-clustered |
| **B-Tree vs Hash Index** | Structure, use cases, range query support |
| **Composite Indexes** | Multi-column indexes, left-prefix rule, column ordering |
| **Covering Indexes** | Index-only scans, avoiding heap/table lookups |
| **Index Tradeoffs** | Write overhead, storage cost, when NOT to index |

---

## Module Structure

```
database-indexing/
│   README.md
│
├── concepts/                  ← Phase 1: Core concept breakdowns + visuals
│   ├── what-is-an-index/
│   ├── btree-vs-hash/
│   ├── composite-indexes/
│   ├── covering-indexes/
│   └── index-tradeoffs/
│
├── interview-questions/       ← Phase 2: Interview Q&A by difficulty
│   ├── easy/
│   ├── medium/
│   └── advanced/
│
├── implementations/           ← Phase 3: MongoDB query demos
│   └── query-demos(mongodb)/
│
└── resources/                 ← Links, papers, further reading
```

---

## How to Use This Module

1. **Read concepts first** — each folder has a `notes.md` and an animated `visual.gif`
2. **Practice Q&A** — go through interview questions by difficulty
3. **Run the demos** — hands-on MongoDB queries to see indexing in action

---

## Difficulty Levels

- 🟢 **Easy** — Definition-level, expected at any interview
- 🟡 **Medium** — Tradeoff reasoning, query optimization scenarios
- 🔴 **Advanced** — Schema design, index strategy, edge cases