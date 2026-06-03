/**
 * db.js — Shared Mongoose Connection
 *
 * INTERVIEW NOTE:
 * In production systems, you NEVER create a new DB connection per query.
 * A shared connection pool is established once at app startup and reused.
 * Mongoose manages a connection pool internally (default size: 5).
 * This file is the single source of truth for the DB connection.
 *
 * Interview Q: "How do you manage DB connections in Node.js?"
 * A: Use a connection pool via Mongoose or the native driver. Connect once
 *    at startup, reuse the connection across modules via a shared export.
 */

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/indexing_demo";

/**
 * connect() — Call this once at app/script startup.
 * All implementation files import and call this before running queries.
 */
async function connect() {
  if (mongoose.connection.readyState === 1) {
    // Already connected — no-op (avoids duplicate connections in watch mode)
    return;
  }

  await mongoose.connect(MONGO_URI, {
    // These are the recommended production settings:
    maxPoolSize: 10,          // Max concurrent connections in the pool
    serverSelectionTimeoutMS: 5000, // Fail fast if Mongo is unreachable
    socketTimeoutMS: 45000,   // Close idle sockets after 45s
  });

  console.log(`✅ MongoDB connected → ${MONGO_URI}`);
}

/**
 * disconnect() — Call this at the end of standalone scripts.
 * In a real Express app, you'd keep the connection alive for the app lifetime.
 */
async function disconnect() {
  await mongoose.disconnect();
  console.log("🔌 MongoDB disconnected");
}

module.exports = { connect, disconnect, mongoose };