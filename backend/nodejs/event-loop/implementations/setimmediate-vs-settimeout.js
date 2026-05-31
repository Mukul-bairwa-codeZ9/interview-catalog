/**
 * FILE: setimmediate-vs-settimeout.js
 *
 * CONCEPT: setImmediate() vs setTimeout() Execution Order
 *
 * INTERVIEW RELEVANCE:
 *   A classic Node.js trick question:
 *   "Which fires first — setImmediate or setTimeout(fn, 0)?"
 *   The answer is: IT DEPENDS. And explaining WHY earns senior-level credit.
 *
 * THE RULE:
 *   - At the TOP LEVEL (outside I/O): order is NON-DETERMINISTIC.
 *     setTimeout and setImmediate race depending on system timer resolution.
 *
 *   - INSIDE an I/O callback: setImmediate ALWAYS fires before setTimeout.
 *     This is guaranteed by the event loop phase order.
 *
 * EVENT LOOP PHASE ORDER (relevant phases):
 *   timers → pending callbacks → idle/prepare → poll → check → close callbacks
 *                                                        ↑
 *                                               setImmediate runs here (check phase)
 *   setTimeout runs in the "timers" phase (beginning of the loop)
 *   After an I/O callback, the loop is already past "timers" → hits "check" first
 *
 * RUN: node setimmediate-vs-settimeout.js
 */

// ─────────────────────────────────────────────
// DEMO 1: Top-level — Non-deterministic order
// ─────────────────────────────────────────────

console.log("=== DEMO 1: Top-level (non-deterministic) ===");
console.log("Run this multiple times — the order may change\n");

setTimeout(() => {
  console.log("TOP-LEVEL: setTimeout fired");
}, 0);

setImmediate(() => {
  console.log("TOP-LEVEL: setImmediate fired");
});

/**
 * WHY NON-DETERMINISTIC AT TOP LEVEL?
 *   When Node starts, it enters the event loop. setTimeout(fn, 0) is actually
 *   clamped to ~1ms minimum. If the event loop initialization takes >1ms,
 *   the timer is already expired when the "timers" phase runs → setTimeout wins.
 *   If initialization is faster, the loop reaches "check" first → setImmediate wins.
 *   You cannot rely on this order at the top level.
 */

// ─────────────────────────────────────────────
// DEMO 2: Inside I/O — setImmediate ALWAYS wins
// ─────────────────────────────────────────────

const fs = require("fs");

console.log("\n=== DEMO 2: Inside I/O callback (deterministic) ===");

// Reading the current file itself — just to trigger an I/O callback
fs.readFile(__filename, () => {
  // At this point, the event loop is in the "poll" phase (just finished I/O)
  // It will move to "check" phase next — where setImmediate lives
  // "timers" phase already passed for this iteration

  setTimeout(() => {
    console.log("INSIDE I/O: setTimeout fired"); // Always second
  }, 0);

  setImmediate(() => {
    console.log("INSIDE I/O: setImmediate fired"); // Always first
  });
});

/**
 * EXPECTED OUTPUT:
 *   === DEMO 1: Top-level (non-deterministic) ===
 *   Run this multiple times — the order may change
 *
 *   === DEMO 2: Inside I/O callback (deterministic) ===
 *   TOP-LEVEL: setImmediate fired     ← or setTimeout, order varies
 *   TOP-LEVEL: setTimeout fired       ← or setImmediate, order varies
 *   INSIDE I/O: setImmediate fired    ← ALWAYS first
 *   INSIDE I/O: setTimeout fired      ← ALWAYS second
 *
 * NOTE: Demo 1 output appears before Demo 2 because I/O is async.
 */

/**
 * INTERVIEW EXPLAINER:
 *
 *   Q: "Which runs first — setImmediate or setTimeout(fn, 0)?"
 *
 *   A: It depends on context.
 *
 *      At the top level, the order is non-deterministic. setTimeout has a minimum
 *      delay of ~1ms. If the event loop initializes faster than that, setImmediate
 *      (which runs in the "check" phase) may fire first. If slower, setTimeout
 *      (which runs in the "timers" phase) fires first. You can't rely on this.
 *
 *      Inside an I/O callback, setImmediate ALWAYS fires first. This is because
 *      the I/O callback runs during the "poll" phase. After poll, the event loop
 *      moves to the "check" phase where setImmediate lives — before looping back
 *      to "timers" where setTimeout would fire.
 *
 *   Q: "When would you choose setImmediate over setTimeout(fn, 0)?"
 *
 *   A: Use setImmediate when you want to yield to I/O callbacks before continuing,
 *      particularly inside async workflows. It's also safer for recursive async
 *      patterns than process.nextTick because it doesn't starve the event loop.
 *      Use setTimeout(fn, 0) only when you need timer-like semantics or
 *      compatibility in environments that don't support setImmediate (browsers).
 */