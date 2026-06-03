/**
 * text-index.js — Text Indexes in MongoDB (Mongoose)
 *
 * ─────────────────────────────────────────────────────────────────
 * INTERVIEW NOTE:
 * A text index enables full-text search on string fields. Unlike a regular
 * index (exact match / range), a text index tokenizes strings, removes stop
 * words, stems words to their root, and builds an inverted index — the same
 * data structure used by search engines.
 *
 * How it works internally:
 * "Running fast runners" → tokens: ["run", "fast", "runner"]
 * (stop words removed, words stemmed to root form)
 * Each token maps to the list of documents containing it.
 *
 * Key interview points:
 * 1. Only ONE text index allowed per collection (but it can cover many fields)
 * 2. Text search is done with $text + $search operators
 * 3. Each field can have a weight (default 1) — higher weight = more relevant
 * 4. Results can be sorted by relevance score using { score: { $meta: "textScore" } }
 * 5. Text indexes are large — they store every stemmed token
 * 6. For production-scale search, use Elasticsearch or Atlas Search instead
 * ─────────────────────────────────────────────────────────────────
 */

const { connect, disconnect, mongoose } = require("./db");

// ─── 1. SCHEMA DEFINITION ────────────────────────────────────────────────────
/**
 * Blog Post collection — classic use case for text search.
 * Users search by title, content, or tags.
 *
 * Weight strategy:
 * - title: weight 10 — a match in the title is highly relevant
 * - tags: weight 5  — tag match is moderately relevant
 * - body: weight 1  — body match is least relevant (it's long, matches are common)
 *
 * INTERVIEW: "Why assign weights to text index fields?"
 * A: Weights control the relevance score. A search term found in the title
 *    should rank the post higher than one found buried in the body.
 *    Weights let you tune search quality without changing your data.
 */
const postSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  body:      { type: String, required: true },
  tags:      { type: [String], default: [] },
  author:    { type: String },
  category:  { type: String },
  published: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// ─── 2. INDEX DEFINITIONS ─────────────────────────────────────────────────────

/**
 * Text index with field weights
 *
 * MongoDB builds ONE inverted index across all three fields.
 * The `weights` option controls how much each field contributes to the score.
 *
 * INTERVIEW: "Can you have multiple text indexes on a collection?"
 * A: No. MongoDB only allows ONE text index per collection.
 *    But a single text index can cover multiple fields with different weights.
 */
postSchema.index(
  {
    title: "text",
    tags:  "text",
    body:  "text",
  },
  {
    name: "idx_post_text_search",
    weights: {
      title: 10,   // Match in title is 10x more relevant than body
      tags:  5,    // Match in tags is 5x more relevant than body
      body:  1,    // Baseline weight
    },
    // default_language: "english" (default — handles stemming + stop words)
    // Change for multilingual apps: "french", "spanish", "none" (disables stemming)
  }
);

/**
 * IMPORTANT: You can combine a text index with regular index fields.
 * This is called a "compound text index" and is useful when you want to
 * filter by a regular field AND do text search at the same time efficiently.
 *
 * Example (not created here to avoid conflict with above):
 * postSchema.index({ category: 1, "$**": "text" })
 * → filters by category first, then text searches within that category
 *
 * INTERVIEW: "How do you make text search faster for a filtered query?"
 * A: Use a compound text index with the filter field (e.g., category) as a
 *    regular index prefix. MongoDB uses the regular index to narrow results
 *    first, then applies text search on the smaller set.
 */

const Post = mongoose.model("Post", postSchema);

// ─── 3. SEED DATA ─────────────────────────────────────────────────────────────
async function seedData() {
  await Post.deleteMany({});

  const posts = [
    {
      title: "Getting Started with Node.js and Express",
      body:  "Node.js is a JavaScript runtime built on Chrome's V8 engine. Express is a minimal web framework for Node.js that makes building REST APIs fast and easy.",
      tags:  ["nodejs", "express", "javascript", "backend"],
      author: "Mukul", category: "backend",
    },
    {
      title: "Understanding MongoDB Indexes for Performance",
      body:  "Database indexes are data structures that improve query speed. MongoDB uses B-tree indexes by default. Choosing the right index is critical for application performance.",
      tags:  ["mongodb", "database", "indexes", "performance"],
      author: "Priya", category: "database",
    },
    {
      title: "React Hooks: A Complete Guide",
      body:  "React Hooks let you use state and lifecycle features in functional components. useState, useEffect, and useCallback are the most commonly used hooks.",
      tags:  ["react", "javascript", "frontend", "hooks"],
      author: "Rahul", category: "frontend",
    },
    {
      title: "Building Scalable APIs with Node.js",
      body:  "Scalability in Node.js requires careful consideration of clustering, load balancing, and efficient database queries. Express middleware helps structure large applications.",
      tags:  ["nodejs", "api", "scalability", "backend"],
      author: "Sneha", category: "backend",
    },
    {
      title: "Database Performance Tuning: Indexes and Query Optimization",
      body:  "Query optimization starts with understanding execution plans. Use EXPLAIN to see if MongoDB is using indexes. Avoid collection scans on large datasets by adding appropriate indexes.",
      tags:  ["database", "performance", "mongodb", "optimization"],
      author: "Arjun", category: "database",
    },
    {
      title: "Introduction to Redis Caching",
      body:  "Redis is an in-memory data structure store used as a cache, message broker, and database. Caching frequently accessed data in Redis reduces database load significantly.",
      tags:  ["redis", "caching", "performance", "backend"],
      author: "Kavita", category: "backend",
    },
    {
      title: "JavaScript Async Patterns: Promises and Async/Await",
      body:  "Asynchronous JavaScript can be handled with callbacks, Promises, or async/await syntax. Async/await makes asynchronous code look and behave like synchronous code.",
      tags:  ["javascript", "async", "promises", "nodejs"],
      author: "Rohit", category: "javascript",
    },
  ];

  await Post.insertMany(posts);
  console.log(`🌱 Seeded ${posts.length} posts`);
}

// ─── 4. QUERY DEMOS ──────────────────────────────────────────────────────────

/**
 * Demo 1: Basic text search
 * $text + $search performs tokenized, stemmed search across all indexed fields.
 *
 * INTERVIEW: "How does MongoDB text search differ from a regex query?"
 * A: $text uses an inverted index and stemming — much faster on large collections
 *    and handles word variations ("run" matches "running", "runner").
 *    Regex ($regex) does no indexing — it's a full scan even with a regular index.
 */
async function demo_basicSearch() {
  console.log("\n── Demo 1: Basic text search for 'nodejs' ──");

  const results = await Post.find(
    { $text: { $search: "nodejs" } },
    { score: { $meta: "textScore" }, title: 1, author: 1 } // project score
  ).sort({ score: { $meta: "textScore" } }); // sort by relevance

  results.forEach(p =>
    console.log(`  [score: ${p.score?.toFixed(2)}] "${p.title}" — ${p.author}`)
  );
}

/**
 * Demo 2: Multi-word search (AND behavior by default)
 * "nodejs express" finds posts containing BOTH "nodejs" AND "express"
 *
 * INTERVIEW: "How do you do phrase search in MongoDB?"
 * A: Wrap the phrase in escaped quotes: $search: '"exact phrase"'
 *    Without quotes, multiple words = AND (all words must appear).
 */
async function demo_multiWordSearch() {
  console.log('\n── Demo 2: Multi-word search "nodejs express" (implicit AND) ──');

  const results = await Post.find(
    { $text: { $search: "nodejs express" } },
    { score: { $meta: "textScore" }, title: 1 }
  ).sort({ score: { $meta: "textScore" } });

  results.forEach(p =>
    console.log(`  [score: ${p.score?.toFixed(2)}] "${p.title}"`)
  );
  console.log('  ℹ️  Only posts with BOTH "nodejs" and "express" are returned');
}

/**
 * Demo 3: Phrase search (exact phrase)
 * Quotes inside the $search string enforce exact phrase matching.
 */
async function demo_phraseSearch() {
  console.log('\n── Demo 3: Exact phrase search "query optimization" ──');

  const results = await Post.find(
    { $text: { $search: '"query optimization"' } }, // escaped quotes = phrase
    { score: { $meta: "textScore" }, title: 1 }
  ).sort({ score: { $meta: "textScore" } });

  if (results.length === 0) {
    console.log('  (No exact phrase match for "query optimization")');
  } else {
    results.forEach(p =>
      console.log(`  [score: ${p.score?.toFixed(2)}] "${p.title}"`)
    );
  }
}

/**
 * Demo 4: Negation — exclude posts containing a word
 * Prefix with "-" to exclude documents containing that term.
 *
 * INTERVIEW: "How do you exclude terms in MongoDB text search?"
 * A: Use a minus prefix: $search: "database -redis"
 *    This returns posts about "database" but NOT about "redis".
 */
async function demo_negationSearch() {
  console.log('\n── Demo 4: "database" but NOT "redis" ──');

  const results = await Post.find(
    { $text: { $search: "database -redis" } },
    { score: { $meta: "textScore" }, title: 1 }
  ).sort({ score: { $meta: "textScore" } });

  results.forEach(p =>
    console.log(`  [score: ${p.score?.toFixed(2)}] "${p.title}"`)
  );
}

/**
 * Demo 5: Text search combined with regular filter
 * Search for "performance" but only in "database" category.
 *
 * INTERVIEW: "Can you combine $text search with other query operators?"
 * A: Yes. $text can be combined with regular field filters.
 *    MongoDB applies the regular filter first (using a regular index if available),
 *    then applies text search on the filtered subset.
 */
async function demo_textWithFilter() {
  console.log('\n── Demo 5: Text search "performance" filtered to category "database" ──');

  const results = await Post.find(
    {
      $text: { $search: "performance" },
      category: "database",                 // regular field filter
    },
    { score: { $meta: "textScore" }, title: 1, category: 1 }
  ).sort({ score: { $meta: "textScore" } });

  results.forEach(p =>
    console.log(`  [score: ${p.score?.toFixed(2)}] "${p.title}" [${p.category}]`)
  );
}

/**
 * Demo 6: Weight effect — title match vs body match
 * Shows how weights cause title matches to score higher than body matches.
 * Search "javascript": appears in titles AND bodies.
 * Posts with "javascript" in the title should rank higher.
 */
async function demo_weightEffect() {
  console.log('\n── Demo 6: Weight effect — "javascript" title vs body match ──');

  const results = await Post.find(
    { $text: { $search: "javascript" } },
    { score: { $meta: "textScore" }, title: 1 }
  ).sort({ score: { $meta: "textScore" } });

  console.log('  Posts ranked by relevance (title weight=10, body weight=1):');
  results.forEach(p =>
    console.log(`  [score: ${p.score?.toFixed(2)}] "${p.title}"`)
  );
  console.log('  ℹ️  Posts with "javascript" in the TITLE rank higher due to weight=10');
}

// ─── 5. MAIN RUNNER ──────────────────────────────────────────────────────────
async function main() {
  await connect();
  await mongoose.connection.syncIndexes();
  await seedData();
  await demo_basicSearch();
  await demo_multiWordSearch();
  await demo_phraseSearch();
  await demo_negationSearch();
  await demo_textWithFilter();
  await demo_weightEffect();
  await disconnect();
}

main().catch(console.error);

/**
 * ─── INTERVIEW CHEAT SHEET ───────────────────────────────────────────────────
 *
 * Q: What is a text index in MongoDB?
 * A: An inverted index that tokenizes string fields, removes stop words,
 *    and stems words to their root. Enables full-text search via $text + $search.
 *
 * Q: How many text indexes can a collection have?
 * A: Exactly ONE. But it can cover multiple fields with different weights.
 *
 * Q: What is stemming and why does it matter?
 * A: Stemming reduces words to their root: "running" → "run", "indexes" → "index".
 *    This means a search for "run" will match documents containing "running",
 *    "runs", "runner" — without needing to handle all variations explicitly.
 *
 * Q: How do you rank results by relevance?
 * A: Project { score: { $meta: "textScore" } } and sort by it.
 *    MongoDB computes a relevance score based on term frequency and weights.
 *
 * Q: What are text index weights?
 * A: A number (default 1) assigned to each indexed field. A match in a
 *    field with weight 10 contributes 10x more to the relevance score than
 *    a match in a field with weight 1.
 *
 * Q: What are the limitations of MongoDB text indexes?
 * A: (1) Only one per collection, (2) no support for fuzzy matching /
 *    typo tolerance, (3) large index size, (4) no ranking customization
 *    beyond weights. For production search at scale, use Elasticsearch
 *    or MongoDB Atlas Search (which is built on Lucene).
 *
 * Q: $text vs $regex — when to use which?
 * A: $text — fast, uses inverted index, handles stemming, for real search UX.
 *    $regex — flexible pattern matching but always scans (even with an index
 *    on the field, only anchored regex like /^prefix/ can use an index).
 *    Use $text for search features, $regex for validation/pattern matching.
 * ─────────────────────────────────────────────────────────────────────────────
 */