/**
 * partial-index.js — Partial Indexes in MongoDB (Mongoose)
 *
 * ─────────────────────────────────────────────────────────────────
 * INTERVIEW NOTE:
 * A partial index only indexes documents that match a filter condition.
 * Instead of indexing every document in a collection, you index only
 * the subset you actually query on.
 *
 * Why this matters:
 * - Smaller index → fits in RAM more easily
 * - Faster writes → fewer index entries to update
 * - Enforces conditional uniqueness (e.g., unique email only for active users)
 *
 * Classic use case: A collection has 10M orders. 9.9M are "delivered".
 * Your app only queries "pending" orders (100K). Why index 10M documents
 * when you only need to search 100K? A partial index solves this.
 *
 * Key interview points:
 * 1. Partial index = regular index + filter expression
 * 2. MongoDB ONLY uses the index if the query includes the filter condition
 * 3. Partial unique indexes allow "unique among active records" patterns
 * 4. More memory efficient than full indexes on large collections
 * 5. partialFilterExpression supports: $eq, $gt, $gte, $lt, $lte,
 *    $type, $exists, $and — NOT $or or $in
 * ─────────────────────────────────────────────────────────────────
 */

const { connect, disconnect, mongoose } = require("./db");

// ─── 1. SCHEMA DEFINITION ────────────────────────────────────────────────────
/**
 * Support Ticket system.
 * Most tickets are "closed" (historical). Active tickets are "open" or "in_progress".
 * We almost never query closed tickets — they're just stored for records.
 *
 * Without partial index: index covers ALL tickets (millions of closed ones)
 * With partial index: index covers ONLY open/in_progress tickets (thousands)
 */
const ticketSchema = new mongoose.Schema({
  ticketId:   { type: String, required: true },
  userId:     { type: String, required: true },
  status:     { type: String, enum: ["open", "in_progress", "closed"], default: "open" },
  priority:   { type: String, enum: ["low", "medium", "high", "critical"] },
  assignedTo: { type: String },  // agent ID — null if unassigned
  createdAt:  { type: Date, default: Date.now },
  closedAt:   { type: Date },
});

// ─── 2. INDEX DEFINITIONS ─────────────────────────────────────────────────────

/**
 * Index 1: Partial index on userId, only for NON-closed tickets
 *
 * Query pattern: "Show me all open/in_progress tickets for this user"
 * This is the dashboard query — runs constantly.
 *
 * Without partial index: scans userId index across ALL tickets (including millions of closed)
 * With partial index: scans only among open/in_progress tickets
 *
 * INTERVIEW: "How does MongoDB know to use this index?"
 * A: The query must include a condition that IMPLIES the filter.
 *    Here, querying { userId, status: "open" } implies status != "closed",
 *    so MongoDB uses the partial index.
 *    But querying { userId } alone does NOT use it — the query might want
 *    closed tickets too, so MongoDB can't safely use the partial index.
 */
ticketSchema.index(
  { userId: 1, createdAt: -1 },
  {
    name: "idx_active_tickets_by_user",
    partialFilterExpression: { status: { $in: ["open", "in_progress"] } },
    // NOTE: $in is allowed in partialFilterExpression in MongoDB 3.2+
  }
);

/**
 * Index 2: Partial index on assignedTo, only for unassigned tickets
 *
 * Query pattern: "Show me all unassigned high-priority tickets"
 * This powers the agent assignment dashboard.
 *
 * INTERVIEW: "Why not just index all tickets by assignedTo?"
 * A: Most tickets are assigned (assignedTo is set). The unassigned queue
 *    is a tiny fraction. Indexing all docs wastes memory when we only
 *    ever query the unassigned subset.
 *
 * $exists: false = only index documents where assignedTo field is absent/null
 */
ticketSchema.index(
  { priority: 1, createdAt: 1 },
  {
    name: "idx_unassigned_tickets",
    partialFilterExpression: { assignedTo: { $exists: false } },
  }
);

/**
 * Index 3: Partial UNIQUE index — conditional uniqueness
 *
 * Business rule: A user can only have ONE open ticket per priority level.
 * But they can have multiple closed tickets of the same priority (historical records).
 *
 * A full unique index on {userId, priority} would block this entirely.
 * A partial unique index enforces uniqueness ONLY among open tickets.
 *
 * INTERVIEW: "How do you enforce unique constraints only for certain records?"
 * A: Use a partial unique index with a partialFilterExpression that matches
 *    only the records where uniqueness should be enforced.
 */
ticketSchema.index(
  { userId: 1, priority: 1 },
  {
    name: "idx_unique_open_ticket_per_priority",
    unique: true,
    partialFilterExpression: { status: "open" },
    // This means: { userId, priority } must be unique AMONG open tickets only
  }
);

const Ticket = mongoose.model("Ticket", ticketSchema);

// ─── 3. SEED DATA ─────────────────────────────────────────────────────────────
async function seedData() {
  await Ticket.deleteMany({});

  const tickets = [
    // user_1 active tickets
    { ticketId: "T001", userId: "user_1", status: "open",        priority: "high",     createdAt: new Date("2024-01-10") },
    { ticketId: "T002", userId: "user_1", status: "in_progress", priority: "medium",   createdAt: new Date("2024-01-12"), assignedTo: "agent_1" },
    { ticketId: "T003", userId: "user_1", status: "open",        priority: "low",      createdAt: new Date("2024-01-14") },

    // user_1 closed tickets (historical — partial index won't cover these)
    { ticketId: "T004", userId: "user_1", status: "closed",      priority: "high",     createdAt: new Date("2023-06-01"), closedAt: new Date("2023-06-03") },
    { ticketId: "T005", userId: "user_1", status: "closed",      priority: "medium",   createdAt: new Date("2023-07-15"), closedAt: new Date("2023-07-17") },
    { ticketId: "T006", userId: "user_1", status: "closed",      priority: "high",     createdAt: new Date("2023-08-20"), closedAt: new Date("2023-08-22") },

    // user_2 active tickets
    { ticketId: "T007", userId: "user_2", status: "open",        priority: "critical", createdAt: new Date("2024-01-15") },
    { ticketId: "T008", userId: "user_2", status: "open",        priority: "low",      createdAt: new Date("2024-01-16") },

    // Unassigned high priority tickets
    { ticketId: "T009", userId: "user_3", status: "open",        priority: "critical", createdAt: new Date("2024-01-17") },
    { ticketId: "T010", userId: "user_3", status: "open",        priority: "high",     createdAt: new Date("2024-01-18") },
  ];

  await Ticket.insertMany(tickets);
  console.log(`🌱 Seeded ${tickets.length} tickets`);
}

// ─── 4. QUERY DEMOS ──────────────────────────────────────────────────────────

/**
 * Demo 1: Query that USES the partial index
 * Includes status condition that matches the partialFilterExpression
 */
async function demo_queryUsesPartialIndex() {
  console.log("\n── Demo 1: Active tickets for user_1 (partial index USED) ──");

  const tickets = await Ticket.find({
    userId: "user_1",
    status: { $in: ["open", "in_progress"] }, // matches partialFilterExpression
  }).sort({ createdAt: -1 });

  tickets.forEach(t =>
    console.log(`  [${t.ticketId}] ${t.priority} | ${t.status} | ${t.createdAt.toDateString()}`)
  );
  console.log("✅ Uses idx_active_tickets_by_user (partial index — only non-closed tickets indexed)");
}

/**
 * Demo 2: Query that does NOT use the partial index
 * Omits status — MongoDB can't guarantee the result won't include closed tickets,
 * so it can't safely use the partial index → falls back to COLLSCAN
 *
 * INTERVIEW: "Why isn't the partial index used here?"
 * A: The query doesn't include a condition that implies the partialFilterExpression.
 *    MongoDB can only use a partial index when the query predicate is a superset
 *    of the partialFilterExpression — meaning the index is guaranteed to contain
 *    all documents the query could return.
 */
async function demo_queryBypassesPartialIndex() {
  console.log("\n── Demo 2: ALL tickets for user_1 (partial index BYPASSED) ──");

  const tickets = await Ticket.find({ userId: "user_1" }); // no status filter
  console.log(`  Total tickets for user_1: ${tickets.length} (includes closed)`);
  console.log("⚠️  Does NOT use partial index — query may need closed tickets too → COLLSCAN");
}

/**
 * Demo 3: Unassigned ticket queue (partial index on assignedTo absence)
 */
async function demo_unassignedQueue() {
  console.log("\n── Demo 3: Unassigned critical/high tickets queue ──");

  const tickets = await Ticket.find({
    assignedTo: { $exists: false },   // matches partialFilterExpression
    priority: { $in: ["critical", "high"] },
  }).sort({ priority: 1, createdAt: 1 });

  tickets.forEach(t =>
    console.log(`  [${t.ticketId}] ${t.priority} | user: ${t.userId} | ${t.createdAt.toDateString()}`)
  );
  console.log("✅ Uses idx_unassigned_tickets partial index");
}

/**
 * Demo 4: Partial unique index in action
 * user_1 already has an open "high" priority ticket (T001).
 * Trying to insert another open "high" ticket for user_1 should FAIL.
 * But a CLOSED "high" ticket for user_1 should SUCCEED (not in the unique index).
 */
async function demo_partialUniqueIndex() {
  console.log("\n── Demo 4: Partial unique index — conditional uniqueness ──");

  // This should FAIL — user_1 already has open+high (T001)
  try {
    await Ticket.create({
      ticketId: "T_DUPE",
      userId: "user_1",
      status: "open",
      priority: "high",
    });
    console.log("  ❌ Should have failed — duplicate open+high for user_1");
  } catch (err) {
    console.log("  ✅ Correctly rejected duplicate open+high ticket for user_1");
    console.log(`     Error: ${err.message.split("\n")[0]}`);
  }

  // This should SUCCEED — status is "closed", not covered by the unique index
  try {
    await Ticket.create({
      ticketId: "T_CLOSED_DUPE",
      userId: "user_1",
      status: "closed",
      priority: "high",
      closedAt: new Date(),
    });
    console.log("  ✅ Allowed closed+high ticket for user_1 (partial unique index doesn't cover closed)");
    await Ticket.deleteOne({ ticketId: "T_CLOSED_DUPE" }); // cleanup
  } catch (err) {
    console.log("  ❌ Unexpected error:", err.message);
  }
}

// ─── 5. MAIN RUNNER ──────────────────────────────────────────────────────────
async function main() {
  await connect();
  await mongoose.connection.syncIndexes();
  await seedData();
  await demo_queryUsesPartialIndex();
  await demo_queryBypassesPartialIndex();
  await demo_unassignedQueue();
  await demo_partialUniqueIndex();
  await disconnect();
}

main().catch(console.error);

/**
 * ─── INTERVIEW CHEAT SHEET ───────────────────────────────────────────────────
 *
 * Q: What is a partial index?
 * A: An index that only covers documents matching a filter expression.
 *    It's smaller, faster to build, and uses less RAM than a full index.
 *    Perfect when you only query a specific subset of a collection.
 *
 * Q: When should you use a partial index?
 * A: When your queries consistently target a subset — e.g., only "active"
 *    records, only "unassigned" items, only recent documents. If 90% of
 *    your collection is historical/archived data you rarely query, a partial
 *    index on the active 10% is far more efficient.
 *
 * Q: When does MongoDB use a partial index?
 * A: Only when the query predicate is a superset of the partialFilterExpression.
 *    The query must guarantee it won't need documents outside the index.
 *    If in doubt, check with .explain() — look for IXSCAN vs COLLSCAN.
 *
 * Q: What is a partial unique index? Give a real use case.
 * A: A unique index that only enforces uniqueness among documents matching
 *    the filter. Example: unique email among active users only — deleted/
 *    deactivated users can share emails with new signups.
 *
 * Q: What operators are allowed in partialFilterExpression?
 * A: $eq, $gt, $gte, $lt, $lte, $type, $exists, $and.
 *    NOT supported: $or, $in (in older versions), $nor, $not.
 *
 * Q: Partial index vs sparse index — what's the difference?
 * A: A sparse index is a special case of partial index — it only indexes
 *    documents where the field EXISTS (non-null). A partial index is more
 *    flexible: you define any filter condition, not just field existence.
 *    Sparse index = partialFilterExpression: { field: { $exists: true } }
 * ─────────────────────────────────────────────────────────────────────────────
 */