/**
 * index-analysis.js — Query Analysis & Index Profiling in MongoDB (Mongoose)
 *
 * ─────────────────────────────────────────────────────────────────
 * INTERVIEW NOTE:
 * Knowing how to CREATE indexes is only half the job. The other half is
 * knowing how to VERIFY they're being used, diagnose slow queries, and
 * measure index effectiveness. This is what separates junior devs from
 * senior engineers in interviews.
 *
 * Tools covered in this file:
 * 1. explain("queryPlanner")    — which index MongoDB PLANS to use
 * 2. explain("executionStats")  — actual runtime stats (docs scanned, time taken)
 * 3. explain("allPlansExecution") — all candidate plans MongoDB evaluated
 * 4. $indexStats                — usage stats for all indexes (which are actually used?)
 * 5. db.setProfilingLevel()     — slow query logger (the production tool)
 * 6. Hint                       — force MongoDB to use a specific index
 *
 * Key interview points:
 * 1. COLLSCAN = bad. IXSCAN = good. This is the #1 thing to look for.
 * 2. "nReturned vs totalDocsExamined" ratio tells you index efficiency
 * 3. In production, enable profiling at level 1 (slow queries only)
 * 4. $indexStats shows which indexes are NEVER used — drop them to save RAM
 * 5. hint() is a last resort — trust the query planner unless it's clearly wrong
 * ─────────────────────────────────────────────────────────────────
 */

const { connect, disconnect, mongoose } = require("./db");

// ─── 1. SCHEMA + INDEXES ──────────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  category:  { type: String },
  price:     { type: Number },
  stock:     { type: Number },
  rating:    { type: Number },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Index we EXPECT to be used
productSchema.index({ category: 1, price: 1 },  { name: "idx_category_price" });
productSchema.index({ rating: -1 },              { name: "idx_rating_desc" });
productSchema.index({ isActive: 1, stock: 1 },   { name: "idx_active_stock" });

// An intentionally redundant index (to demonstrate $indexStats — never used)
productSchema.index({ name: 1 }, { name: "idx_name_unused" });

const Product = mongoose.model("Product", productSchema);

// ─── 2. SEED DATA ─────────────────────────────────────────────────────────────
async function seedData() {
  await Product.deleteMany({});

  const categories = ["Electronics", "Clothing", "Books", "Food", "Sports"];
  const products = [];

  for (let i = 1; i <= 50; i++) {
    products.push({
      name:     `Product_${i}`,
      category: categories[i % categories.length],
      price:    Math.floor(Math.random() * 5000) + 100,
      stock:    Math.floor(Math.random() * 200),
      rating:   parseFloat((Math.random() * 4 + 1).toFixed(1)),
      isActive: i % 10 !== 0, // 10% inactive
    });
  }

  await Product.insertMany(products);
  console.log(`🌱 Seeded ${products.length} products`);
}

// ─── 3. EXPLAIN HELPERS ───────────────────────────────────────────────────────

/**
 * Parses and prints the most useful parts of an explain() output.
 * In a real app, you'd dump the full explain() to a log for analysis.
 *
 * INTERVIEW: "What are the key fields to look at in explain() output?"
 * A:
 *  - stage: "COLLSCAN" (bad) or "IXSCAN" (good)
 *  - indexName: which index was used
 *  - nReturned: how many docs matched
 *  - totalDocsExamined: how many docs MongoDB looked at
 *  - totalKeysExamined: how many index entries scanned
 *  - executionTimeMillis: total query time
 *
 * Ideal: nReturned ≈ totalDocsExamined (high efficiency)
 * Bad:   nReturned << totalDocsExamined (low efficiency — scanning many to return few)
 */
function printExplainSummary(label, explainResult) {
  console.log(`\n  📊 ${label}`);

  const plan = explainResult.queryPlanner?.winningPlan;
  const stats = explainResult.executionStats;

  if (!plan) {
    console.log("  (No queryPlanner data)");
    return;
  }

  // Walk the plan tree to find the leaf stage
  function getLeafStage(node) {
    if (!node.inputStage) return node;
    return getLeafStage(node.inputStage);
  }

  const leafStage = getLeafStage(plan);
  const stageName = leafStage.stage || plan.stage;
  const indexUsed = leafStage.indexName || plan.indexName || "none";

  const icon = stageName === "COLLSCAN" ? "🔴" : "🟢";

  console.log(`  ${icon} Stage: ${stageName}`);
  console.log(`     Index used:            ${indexUsed}`);

  if (stats) {
    console.log(`     Docs returned:         ${stats.nReturned}`);
    console.log(`     Docs examined:         ${stats.totalDocsExamined}`);
    console.log(`     Index keys examined:   ${stats.totalKeysExamined}`);
    console.log(`     Execution time (ms):   ${stats.executionTimeMillis}`);

    // Efficiency ratio — closer to 1.0 is better
    if (stats.totalDocsExamined > 0) {
      const efficiency = (stats.nReturned / stats.totalDocsExamined).toFixed(2);
      const effIcon = efficiency >= 0.8 ? "✅" : efficiency >= 0.4 ? "⚠️" : "❌";
      console.log(`     Efficiency ratio:      ${efficiency} ${effIcon} (nReturned / docsExamined)`);
    }
  }
}

// ─── 4. EXPLAIN DEMOS ────────────────────────────────────────────────────────

/**
 * Demo 1: IXSCAN — query using a compound index correctly
 * category (Equality) + price (Range) → uses idx_category_price
 */
async function demo_explainIXSCAN() {
  console.log("\n── Demo 1: explain() — IXSCAN (compound index hit) ──");

  const explainResult = await Product.find({
    category: "Electronics",
    price: { $lte: 2000 },
  }).explain("executionStats");

  printExplainSummary("category + price query", explainResult);
  console.log("  ✅ Should show IXSCAN using idx_category_price");
}

/**
 * Demo 2: COLLSCAN — query on non-indexed field
 * Querying `stock` directly without an index covering it as the lead field.
 *
 * INTERVIEW: "What causes a COLLSCAN and how do you fix it?"
 * A: A COLLSCAN happens when no index covers the query fields.
 *    Fix: add an index on the queried field(s). After adding, re-run explain()
 *    to confirm the stage changes from COLLSCAN to IXSCAN.
 */
async function demo_explainCOLLSCAN() {
  console.log("\n── Demo 2: explain() — COLLSCAN (no index on queried field) ──");

  // Querying only on `stock` — no index with stock as lead field
  const explainResult = await Product.find({
    stock: { $lt: 10 },
  }).explain("executionStats");

  printExplainSummary("stock < 10 (no index)", explainResult);
  console.log("  🔴 Should show COLLSCAN — stock has no standalone index");
  console.log("     Fix: add { stock: 1 } index or restructure query");
}

/**
 * Demo 3: explain("allPlansExecution") — see ALL candidate plans
 * MongoDB evaluates multiple index candidates and picks the winner.
 * allPlansExecution shows you ALL plans considered, not just the winner.
 *
 * INTERVIEW: "How does MongoDB choose which index to use?"
 * A: The query planner runs all candidate plans in parallel for a small
 *    number of docs. The plan that returns results fastest wins. MongoDB
 *    caches this winner for similar queries (plan cache). Use
 *    allPlansExecution to see rejected plans.
 */
async function demo_allPlans() {
  console.log("\n── Demo 3: explain('allPlansExecution') — all candidate plans ──");

  const explainResult = await Product.find({
    isActive: true,
    stock: { $gt: 50 },
  }).explain("allPlansExecution");

  const winningPlan = explainResult.queryPlanner?.winningPlan;
  const rejectedPlans = explainResult.queryPlanner?.rejectedPlans || [];

  console.log(`  🏆 Winning plan stage: ${winningPlan?.stage || winningPlan?.inputStage?.stage}`);
  console.log(`  📋 Rejected plans: ${rejectedPlans.length}`);
  rejectedPlans.forEach((p, i) =>
    console.log(`     Rejected ${i + 1}: ${p.stage || p.inputStage?.stage || JSON.stringify(p).slice(0, 60)}`)
  );
  console.log("  ℹ️  Use allPlansExecution to understand why the planner chose one index over another");
}

/**
 * Demo 4: hint() — force a specific index
 * Normally you trust the query planner. But occasionally it picks the wrong
 * index (especially on very skewed data distributions).
 *
 * INTERVIEW: "When should you use hint()?"
 * A: Rarely — only when you've confirmed via explain() that the query planner
 *    is choosing a suboptimal index. Overusing hint() is an anti-pattern
 *    because it breaks when index names change. Always explain() first.
 */
async function demo_hint() {
  console.log("\n── Demo 4: hint() — forcing a specific index ──");

  // Force MongoDB to use idx_rating_desc even if planner wouldn't choose it
  const explainResult = await Product
    .find({ category: "Books" })
    .sort({ rating: -1 })
    .hint("idx_rating_desc")  // force this index by name
    .explain("executionStats");

  printExplainSummary("forced idx_rating_desc via hint()", explainResult);
  console.log("  ⚠️  hint() is a last resort — trust the planner unless you have proof it's wrong");
}

// ─── 5. INDEX STATS ───────────────────────────────────────────────────────────

/**
 * Demo 5: $indexStats — find unused indexes
 * $indexStats reports how many times each index has been used since
 * the last server restart. Indexes with accesses.ops = 0 are candidates
 * for removal.
 *
 * INTERVIEW: "How do you identify and remove unused indexes?"
 * A: Use db.collection.aggregate([{ $indexStats: {} }]).
 *    Any index with zero accesses (ops: 0) since last restart is unused.
 *    Monitor for a few days across different query patterns before dropping.
 *    Unused indexes waste RAM and slow down writes — drop them.
 *
 * NOTE: Stats reset on mongod restart. Monitor over time in production.
 */
async function demo_indexStats() {
  console.log("\n── Demo 5: $indexStats — index usage since last restart ──");

  // Run a few queries first so stats aren't all zero
  await Product.find({ category: "Electronics", price: { $lte: 2000 } });
  await Product.find({ rating: { $gte: 4 } }).sort({ rating: -1 });
  await Product.find({ isActive: true, stock: { $gt: 100 } });
  // Intentionally NOT querying by name → idx_name_unused stays at 0

  const stats = await Product.collection.aggregate([{ $indexStats: {} }]).toArray();

  console.log("  Index usage stats:");
  stats
    .sort((a, b) => (b.accesses?.ops || 0) - (a.accesses?.ops || 0))
    .forEach(s => {
      const ops = s.accesses?.ops || 0;
      const icon = ops === 0 ? "🗑️  (consider dropping)" : "✅";
      console.log(`  ${icon} ${s.name.padEnd(35)} | ops: ${ops}`);
    });

  console.log("\n  ℹ️  idx_name_unused shows 0 ops — it was never queried.");
  console.log("     In production: monitor for days, then drop zero-access indexes.");
}

// ─── 6. SLOW QUERY PROFILER ───────────────────────────────────────────────────

/**
 * Demo 6: Slow Query Profiler
 * MongoDB has a built-in query profiler that logs slow queries to system.profile.
 *
 * Profiling levels:
 *   0 = off (default)
 *   1 = log only slow queries (> slowms threshold) ← USE IN PRODUCTION
 *   2 = log ALL queries (very verbose, avoid in production)
 *
 * INTERVIEW: "How do you find slow queries in production MongoDB?"
 * A: Enable profiling at level 1 with a slowms threshold (e.g., 100ms).
 *    MongoDB logs slow queries to the system.profile capped collection.
 *    Query it to find which operations are slow, then add indexes accordingly.
 *
 * WARNING: Level 2 profiling logs everything and can impact performance.
 *          Always use level 1 in production.
 */
async function demo_slowQueryProfiler() {
  console.log("\n── Demo 6: Slow Query Profiler ──");

  const db = mongoose.connection.db;

  // Step 1: Enable profiling at level 1, log queries slower than 0ms
  // (0ms threshold so we capture everything in this demo — use 100ms in production)
  await db.command({ profile: 1, slowms: 0 });
  console.log("  ✅ Profiler enabled (level 1, slowms: 0ms for demo)");

  // Step 2: Run a query that will be logged
  await Product.find({ stock: { $lt: 20 } }); // COLLSCAN — will be slow-ish

  // Step 3: Read from system.profile
  const profileEntries = await db
    .collection("system.profile")
    .find({})
    .sort({ ts: -1 })
    .limit(3)
    .toArray();

  console.log(`\n  📋 Last ${profileEntries.length} profiled operation(s):`);
  profileEntries.forEach((entry, i) => {
    console.log(`\n  Entry ${i + 1}:`);
    console.log(`    Operation:    ${entry.op}`);
    console.log(`    Namespace:    ${entry.ns}`);
    console.log(`    Duration(ms): ${entry.millis}`);
    console.log(`    Docs examined:${entry.docsExamined}`);
    console.log(`    Docs returned:${entry.nreturned}`);
    console.log(`    Plan summary: ${entry.planSummary}`);
    // planSummary shows "COLLSCAN" or "IXSCAN { indexName }"
  });

  // Step 4: Disable profiling (important — always clean up)
  await db.command({ profile: 0 });
  console.log("\n  ✅ Profiler disabled");
  console.log("  ℹ️  In production: use slowms: 100 and monitor system.profile regularly");
}

// ─── 7. MAIN RUNNER ──────────────────────────────────────────────────────────
async function main() {
  await connect();
  await mongoose.connection.syncIndexes();
  await seedData();

  await demo_explainIXSCAN();
  await demo_explainCOLLSCAN();
  await demo_allPlans();
  await demo_hint();
  await demo_indexStats();
  await demo_slowQueryProfiler();

  await disconnect();
}

main().catch(console.error);

/**
 * ─── INTERVIEW CHEAT SHEET ───────────────────────────────────────────────────
 *
 * Q: What is explain() and what are the three verbosity modes?
 * A: explain() shows how MongoDB executed (or plans to execute) a query.
 *    - "queryPlanner": shows the winning plan chosen, no query execution
 *    - "executionStats": executes the query, shows actual runtime stats ← most useful
 *    - "allPlansExecution": shows all candidate plans MongoDB evaluated
 *
 * Q: What's the difference between COLLSCAN and IXSCAN?
 * A: COLLSCAN = collection scan — MongoDB reads every document (O(n), slow).
 *    IXSCAN = index scan — MongoDB traverses the B-tree (O(log n), fast).
 *    Always aim for IXSCAN on large collections.
 *
 * Q: What is the efficiency ratio and what does it tell you?
 * A: nReturned / totalDocsExamined. A ratio of 1.0 is perfect — every doc
 *    examined matched the query. A low ratio (e.g., 0.01) means MongoDB
 *    scanned 100 docs to return 1 — index is poorly selective or wrong.
 *
 * Q: How does the MongoDB query planner pick an index?
 * A: It runs candidate plans in parallel on a small sample of docs. The plan
 *    that produces results fastest wins and is cached in the plan cache.
 *    The cache is invalidated when the collection changes significantly
 *    or indexes are added/dropped.
 *
 * Q: What is $indexStats and why is it useful?
 * A: An aggregation stage that returns usage stats (ops count) per index.
 *    Use it to find indexes with 0 accesses — those are candidates for
 *    removal. Unused indexes waste RAM and slow down all writes.
 *
 * Q: How do you set up the slow query profiler in production?
 * A: db.setProfilingLevel(1, { slowms: 100 })
 *    This logs queries slower than 100ms to system.profile.
 *    Query system.profile to find the slowest operations.
 *    Then use explain() on those queries to add the right indexes.
 *
 * Q: When should you use hint()?
 * A: Rarely — only when you've confirmed via explain() that the planner
 *    chose the wrong index. hint() overrides the planner by index name.
 *    It's fragile (breaks on index rename) and should be a last resort.
 * ─────────────────────────────────────────────────────────────────────────────
 */