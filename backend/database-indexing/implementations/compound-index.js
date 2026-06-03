/**
 * compound-index.js — Compound Indexes in MongoDB (Mongoose)
 *
 * ─────────────────────────────────────────────────────────────────
 * INTERVIEW NOTE:
 * A compound index indexes MULTIPLE fields together in a single B-tree.
 * The ORDER of fields in the index definition is critical — it determines
 * which queries can use the index and how efficiently.
 *
 * The most important rule: ESR Rule
 *   E → Equality fields first  (fields you filter with exact match)
 *   S → Sort fields next       (fields you sort on)
 *   R → Range fields last      (fields you use $gt, $lt, $in on)
 *
 * Key interview points:
 * 1. A compound index on {a, b, c} supports queries on {a}, {a,b}, {a,b,c}
 *    — but NOT {b}, {c}, or {b,c} alone (prefix rule)
 * 2. Field ORDER matters — wrong order = index not used
 * 3. One compound index can replace multiple single-field indexes
 * 4. Direction matters in compound indexes (unlike single-field)
 * 5. Index intersection exists but compound indexes are almost always better
 * ─────────────────────────────────────────────────────────────────
 */

const { connect, disconnect, mongoose } = require("./db");

// ─── 1. SCHEMA DEFINITION ────────────────────────────────────────────────────
/**
 * E-commerce Order collection.
 * Common queries:
 *   - "Find all orders for userId X, sorted by date"          → E: userId, S: createdAt
 *   - "Find pending orders for userId X, in a price range"   → E: userId+status, R: amount
 *   - "Find orders by status, sorted by amount desc"         → E: status, S: amount
 */
const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "shipped", "delivered", "cancelled"],
  },
  amount: { type: Number },
  product: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// ─── 2. INDEX DEFINITIONS ─────────────────────────────────────────────────────

/**
 * Index 1: userId (Equality) + createdAt (Sort)
 * Optimizes: "Get all orders for a user, newest first"
 *   → db.orders.find({ userId: "u1" }).sort({ createdAt: -1 })
 *
 * ESR applied: Equality (userId) → Sort (createdAt)
 * No range field here, so just E + S.
 *
 * INTERVIEW: Why put userId first and not createdAt?
 * A: Because we always filter by userId (equality). If createdAt was first,
 *    the index would scan ALL orders sorted by date, then filter by userId
 *    — far less efficient.
 */
orderSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "idx_userId_createdAt" },
);

/**
 * Index 2: userId (E) + status (E) + amount (R)
 * Optimizes: "Get pending orders for user X with amount > 500"
 *   → db.orders.find({ userId: "u1", status: "pending", amount: { $gt: 500 } })
 *
 * ESR applied: Equality (userId, status) → Range (amount)
 * Both equality fields come first. Range field is last.
 *
 * INTERVIEW: Why does range come last?
 * A: Range queries expand the search to a span in the B-tree. Once you hit
 *    a range, the index can no longer tightly navigate subsequent fields.
 *    Putting range last means equality fields do maximum filtering first.
 */
orderSchema.index(
  { userId: 1, status: 1, amount: 1 },
  { name: "idx_userId_status_amount" },
);

/**
 * Index 3: status (E) + amount (S) — direction matters!
 * Optimizes: "Get all shipped orders sorted by amount descending"
 *   → db.orders.find({ status: "shipped" }).sort({ amount: -1 })
 *
 * INTERVIEW: When does index direction matter in compound indexes?
 * A: When you sort on multiple fields. If the query sorts { amount: -1 }
 *    and the index stores amount as 1 (ascending), MongoDB must do an
 *    in-memory sort — killing performance on large datasets.
 *    Rule: Index direction must MATCH the sort direction.
 */
orderSchema.index(
  { status: 1, amount: -1 },
  { name: "idx_status_amount_desc" },
);

const Order = mongoose.model("Order", orderSchema);

// ─── 3. SEED DATA ─────────────────────────────────────────────────────────────
async function seedData() {
  await Order.deleteMany({});

  const statuses = ["pending", "shipped", "delivered", "cancelled"];
  const products = ["Laptop", "Phone", "Tablet", "Monitor", "Keyboard"];
  const orders = [];

  for (let i = 1; i <= 20; i++) {
    orders.push({
      userId: `user_${(i % 4) + 1}`, // 4 users
      status: statuses[i % statuses.length],
      amount: Math.floor(Math.random() * 2000) + 100,
      product: products[i % products.length],
      createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // staggered dates
    });
  }

  await Order.insertMany(orders);
  console.log(`🌱 Seeded ${orders.length} orders`);
}

// ─── 4. QUERY DEMOS ──────────────────────────────────────────────────────────

/**
 * Demo 1: Compound index hit — E + S pattern
 * Uses idx_userId_createdAt index efficiently.
 */
async function demo_userOrdersSorted() {
  console.log("\n── Demo 1: Orders for user_1, newest first (E + S) ──");
  const orders = await Order.find({ userId: "user_1" })
    .sort({ createdAt: -1 })
    .select("product amount status createdAt");

  orders.forEach((o) =>
    console.log(
      `  ${o.product} | $${o.amount} | ${o.status} | ${o.createdAt.toDateString()}`,
    ),
  );
  console.log("✅ Uses idx_userId_createdAt (E → S)");
}

/**
 * Demo 2: Compound index hit — E + E + R pattern
 * Uses idx_userId_status_amount index efficiently.
 */
async function demo_filteredRangeQuery() {
  console.log(
    "\n── Demo 2: Pending orders for user_2 above $500 (E + E + R) ──",
  );
  const orders = await Order.find({
    userId: "user_2",
    status: "pending",
    amount: { $gt: 500 },
  }).select("product amount");

  if (orders.length === 0) {
    console.log("  (No matching orders — try adjusting seed data threshold)");
  } else {
    orders.forEach((o) => console.log(`  ${o.product} | $${o.amount}`));
  }
  console.log("✅ Uses idx_userId_status_amount (E → E → R)");
}

/**
 * Demo 3: Prefix rule — partial compound index usage
 * Query only uses the FIRST field of idx_userId_createdAt.
 * MongoDB can still use this index (prefix rule) — just not as efficiently
 * as a query using both fields.
 *
 * INTERVIEW: "What is the index prefix rule?"
 * A: A compound index on {a, b, c} supports queries on {a}, {a,b}, {a,b,c}.
 *    It does NOT support queries that skip the leading field (e.g., {b} alone).
 */
async function demo_prefixRule() {
  console.log("\n── Demo 3: Prefix rule — query on userId only ──");
  const count = await Order.countDocuments({ userId: "user_3" });
  console.log(`  Orders for user_3: ${count}`);
  console.log(
    "✅ Still uses idx_userId_createdAt via prefix (userId is the leading field)",
  );
}

/**
 * Demo 4: Index NOT used — violates prefix rule
 * Querying only on `createdAt` skips the leading field `userId`.
 * MongoDB CANNOT use idx_userId_createdAt here → COLLSCAN.
 *
 * INTERVIEW: "Why isn't the index being used here?"
 * A: The query skips the leading field of the compound index. MongoDB can
 *    only use a compound index if the query includes the leftmost field(s).
 */
async function demo_prefixRuleViolation() {
  console.log(
    "\n── Demo 4: Prefix rule VIOLATION — query on createdAt only ──",
  );
  const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const orders = await Order.find({ createdAt: { $gte: cutoff } }).select(
    "userId product",
  );
  console.log(`  Recent orders: ${orders.length}`);
  console.log(
    "⚠️  Does NOT use idx_userId_createdAt — skips leading field (userId)",
  );
  console.log("   MongoDB falls back to COLLSCAN for this query");
}

/**
 * Demo 5: List all indexes — verify compound index creation
 */
async function demo_listIndexes() {
  console.log("\n── Demo 5: All indexes on Order collection ──");
  const indexes = await Order.collection.listIndexes().toArray();
  indexes.forEach((idx) =>
    console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`),
  );
}

// ─── 5. MAIN RUNNER ──────────────────────────────────────────────────────────
async function main() {
  await connect();
  await mongoose.connection.syncIndexes();
  await seedData();
  await demo_userOrdersSorted();
  await demo_filteredRangeQuery();
  await demo_prefixRule();
  await demo_prefixRuleViolation();
  await demo_listIndexes();
  await disconnect();
}

main().catch(console.error);

/**
 * ─── INTERVIEW CHEAT SHEET ───────────────────────────────────────────────────
 *
 * Q: What is the ESR rule?
 * A: The optimal field ordering for compound indexes:
 *    Equality fields first → Sort fields next → Range fields last.
 *    Equality filters narrow results maximally, sort avoids in-memory sort,
 *    range comes last because it expands the B-tree scan.
 *
 * Q: What is the index prefix rule?
 * A: A compound index {a, b, c} can serve queries on {a}, {a,b}, or {a,b,c}.
 *    Queries on {b}, {c}, or {b,c} cannot use this index — they need their
 *    own index.
 *
 * Q: Can one compound index replace multiple single-field indexes?
 * A: Yes. {userId: 1, status: 1} covers queries on userId alone (prefix rule)
 *    AND queries on both userId + status. This reduces index storage and
 *    write overhead.
 *
 * Q: When does index direction matter?
 * A: In compound indexes when sorting on multiple fields. The sort direction
 *    in the query must match (or be the exact opposite of) the index direction.
 *    For single-field indexes, direction doesn't matter.
 *
 * Q: What is index intersection and why prefer compound over it?
 * A: MongoDB can sometimes combine two single-field indexes to answer one
 *    query. But this is slower and less predictable than a purpose-built
 *    compound index. Always prefer a well-designed compound index.
 * 
 * ### Q: If we have a compound index set as `{ userId: 1, status: 1, amount: 1 }`, but our query filters by `userId` and `status` while sorting by `amount: -1`, will it still use the index efficiently?

**A: Yes, it will run with optimal $O(\log n)$ efficiency.** Because `userId` and `status` are handled as exact **equality filters**, MongoDB narrows the search space down to a single, localized bucket within the B-Tree index structure. Inside that specific bucket, the remaining index keys are sorted by `amount` in ascending order (`1`). 

Since MongoDB uses a **doubly linked B-Tree**, the query planner will seamlessly execute a reverse traversal—reading that specific index segment **backwards** to return the results in descending order. 

#### Key Interview Takeaways:
* **The Single-Field Sort Exception:** Changing the sort direction of the **very last field** in a compound index from `1` to `-1` (or vice versa) never breaks performance; it simply forces a backward index scan (`IXSCAN` with a backward direction).
* **When Direction Actually Breaks an Index:** Index direction only degrades performance when you are sorting by *multiple fields with conflicting directions* that do not match the index layout (e.g., trying to sort by `{ status: 1, amount: -1 }` on a `{ status: 1, amount: 1 }` index forces an expensive in-memory sort).
* **Verification:** You can confirm this in production by checking that `.explain("executionStats")` shows an `IXSCAN` stage with the scan direction marked as `backward`.
 * 
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 */
