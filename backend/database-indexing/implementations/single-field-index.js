/**
 * single-field-index.js — Single Field Indexes in MongoDB (Mongoose)
 *
 * ─────────────────────────────────────────────────────────────────
 * INTERVIEW NOTE:
 * A single-field index tells MongoDB to maintain a sorted B-tree structure
 * on ONE field. Without an index, MongoDB does a COLLSCAN (collection scan)
 * — reading every document. With an index, it does an IXSCAN — jumping
 * directly to matching documents. This is the difference between O(n)
 * and O(log n) lookup.
 *
 * Key interview points:
 * 1. MongoDB auto-creates an index on `_id` for every collection
 * 2. Indexes speed up reads but slow down writes (the B-tree must be updated)
 * 3. Indexes consume RAM — Mongo tries to keep the "working set" in memory
 * 4. Direction matters for sorts: `1` = ascending, `-1` = descending
 * 5. A single-field index supports BOTH directions for a sort (unlike compound)
 * ─────────────────────────────────────────────────────────────────
 */

const { connect, disconnect, mongoose } = require("./db");

// ─── 1. SCHEMA DEFINITION ────────────────────────────────────────────────────
/**
 * We have a User collection. Common query: "find users by email" or
 * "find all users in a city". These fields are good index candidates.
 *
 * Rule of thumb: Index fields you frequently filter/sort/query on.
 */
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true },
  city:      { type: String },
  age:       { type: Number },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// ─── 2. INDEX DEFINITIONS ─────────────────────────────────────────────────────

/**
 * Option A: Inline index in schema field definition
 * Use `unique: true` when the field must be unique across all documents.
 * MongoDB enforces this at the database level — not just application level.
 *
 * INTERVIEW: Why index email? Because login queries look like:
 *   db.users.find({ email: "user@example.com" })
 * Without an index on email, this is a full collection scan.
 */
userSchema.index({ email: 1 }, { unique: true });

/**
 * Option B: Separate .index() call — preferred for readability
 * Index on `city` for queries like: "find all users in 'Mumbai'"
 *
 * Direction `1` (ascending) or `-1` (descending).
 * For single-field indexes, direction rarely matters for equality queries.
 * It only matters when you're sorting large result sets.
 */
userSchema.index({ city: 1 });

/**
 * Option C: Index with a custom name
 * Naming indexes helps identify them in explain() output and index stats.
 * Default names are auto-generated (e.g., "city_1") — naming is optional
 * but good practice in large schemas.
 * { name: "idx_user_age" } It replaces MongoDB’s default index naming convention with your own custom string.
 */
userSchema.index({ age: 1 }, { name: "idx_user_age" });

// ─── 3. MODEL ─────────────────────────────────────────────────────────────────
const User = mongoose.model("User", userSchema);

// ─── 4. SEED DATA ─────────────────────────────────────────────────────────────
async function seedData() {
  await User.deleteMany({}); // Clean slate for demo

  const users = [
    { name: "Mukul Sharma",   email: "mukul@example.com",   city: "Delhi",   age: 25 },
    { name: "Priya Patel",    email: "priya@example.com",   city: "Mumbai",  age: 30 },
    { name: "Rahul Verma",    email: "rahul@example.com",   city: "Mumbai",  age: 22 },
    { name: "Sneha Gupta",    email: "sneha@example.com",   city: "Delhi",   age: 28 },
    { name: "Arjun Singh",    email: "arjun@example.com",   city: "Chennai", age: 35 },
    { name: "Kavita Joshi",   email: "kavita@example.com",  city: "Mumbai",  age: 27 },
    { name: "Rohit Mishra",   email: "rohit@example.com",   city: "Delhi",   age: 32 },
    { name: "Ananya Roy",     email: "ananya@example.com",  city: "Kolkata", age: 24 },
  ];

  await User.insertMany(users);
  console.log(`🌱 Seeded ${users.length} users`);
}

// ─── 5. QUERY DEMOS ──────────────────────────────────────────────────────────

/**
 * Demo 1: Equality query on indexed field (email)
 * This hits the unique index on email → IXSCAN (very fast)
 */
async function demo_equalityQuery() {
  console.log("\n── Demo 1: Equality query on indexed email field ──");
  const user = await User.findOne({ email: "priya@example.com" });
  console.log("Found:", user?.name);
  // In production, you'd use .explain() here — see index-analysis.js
}

/**
 * Demo 2: Range query on indexed field (age)
 * MongoDB uses the B-tree index to find the range start, then scans forward.
 * Much faster than a full collection scan for large collections.
 *
 * INTERVIEW: "When does a range query use an index?"
 * A: When the query field has an index AND selectivity is high enough
 *    (i.e., the range doesn't match >30% of the collection — otherwise
 *    MongoDB may choose a COLLSCAN as it's faster for large result sets).
 */
async function demo_rangeQuery() {
  console.log("\n── Demo 2: Range query on indexed age field ──");
  const users = await User.find({ age: { $gte: 25, $lte: 30 } }).sort({ age: 1 });
  console.log("Users aged 25–30:", users.map(u => `${u.name} (${u.age})`));
}
 
/**
 * Demo 3: Query on non-indexed field (name)
 * This forces a COLLSCAN — MongoDB reads every document.
 * On large collections, this is the query that kills performance.
 *
 * INTERVIEW: "How do you find missing indexes?"
 * A: Use db.setProfilingLevel(1, { slowms: 100 }) to log slow queries,
 *    then check explain() output for COLLSCAN — those need indexes.
 */
async function demo_nonIndexedQuery() {
  console.log("\n── Demo 3: Query on non-indexed field (name) → COLLSCAN ──");
  const user = await User.findOne({ name: "Sneha Gupta" });
  console.log("Found:", user?.email);
  console.log("⚠️  This query does a full collection scan — no index on 'name'");
}

/**
 * Demo 4: List all indexes on the collection
 * INTERVIEW: "How do you check which indexes exist?"
 * A: db.collection.getIndexes() in Mongo shell, or listIndexes() in driver.
 */
async function demo_listIndexes() {
  console.log("\n── Demo 4: List all indexes on the User collection ──");
  const indexes = await User.collection.listIndexes().toArray();
  indexes.forEach(idx => {
    console.log(`  Index: ${idx.name} | Key: ${JSON.stringify(idx.key)} | Unique: ${idx.unique || false}`);
  });
}

// ─── 6. MAIN RUNNER ──────────────────────────────────────────────────────────
async function main() {
  await connect();

  // Mongoose auto-creates indexes defined in schema on connection (ensureIndexes)
  // In production, you may want to disable this and manage indexes manually:
  // mongoose.set('autoIndex', false)
  await mongoose.connection.syncIndexes(); // Explicitly sync for demo clarity

  await seedData();
  await demo_equalityQuery();
  await demo_rangeQuery();
  await demo_nonIndexedQuery();
  await demo_listIndexes();

  await disconnect();
}

main().catch(console.error);

/**
 * ─── INTERVIEW CHEAT SHEET ───────────────────────────────────────────────────
 *
 * Q: What is a single-field index?
 * A: A B-tree sorted on one field that lets MongoDB jump to matching
 *    documents instead of scanning the entire collection.
 *
 * Q: When should you NOT add an index?
 * A: Small collections (full scan is fine), low-cardinality fields (e.g.
 *    boolean — only 2 values, index barely helps), or write-heavy collections
 *    where index maintenance overhead outweighs read benefits.
 *
 * Q: What is index selectivity?
 * A: How many documents a query filters out. High selectivity = few matches
 *    = index is very effective. Low selectivity = many matches = index may
 *    be skipped by the query planner.
 *
 * Q: Does index direction matter for single-field indexes?
 * A: For equality queries, no. For sort queries, no — MongoDB can traverse
 *    the B-tree in either direction. Direction only matters for COMPOUND indexes.
 * ─────────────────────────────────────────────────────────────────────────────
 */