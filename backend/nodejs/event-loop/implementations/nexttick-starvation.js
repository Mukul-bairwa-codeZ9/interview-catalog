/**
 * FILE: nexttick-starvation.js
 *
 * CONCEPT: Event Loop Starvation via process.nextTick()
 *
 * INTERVIEW RELEVANCE:
 *   Interviewers at mid-to-senior level will ask:
 *   "What are the dangers of process.nextTick()?"
 *   or "How can you accidentally block the event loop without CPU-heavy code?"
 *   This file demonstrates the answer with a live, runnable example.
 *
 * THE PROBLEM:
 *   process.nextTick() callbacks are drained COMPLETELY before the event loop
 *   moves forward. If a nextTick callback schedules ANOTHER nextTick, Node.js
 *   will keep processing them indefinitely — starving I/O, timers, and Promises.
 *
 * RUN: node nexttick-starvation.js
 */

// ─────────────────────────────────────────────
// DEMO 1: Starvation — setTimeout never fires
// ─────────────────────────────────────────────

let starvationCount = 0;
const STARVATION_LIMIT = 5; // keep it small so the process doesn't hang forever

console.log("=== DEMO 1: nextTick Starvation ===");
console.log("setTimeout scheduled — will it ever fire?\n");

setTimeout(() => {
  // This will NEVER print if nextTick keeps rescheduling itself infinitely.
  // We cap it here with STARVATION_LIMIT to let the demo finish.
  console.log("setTimeout fired! (only because we stopped nextTick recursion)\n");
}, 0);

// This function keeps scheduling itself via nextTick — starving the event loop
function recursiveNextTick() {
  if (starvationCount >= STARVATION_LIMIT) {
    // We stop here intentionally — in real bugs, there's no stop condition
    console.log(`nextTick called ${starvationCount} times — stopping to let event loop breathe`);
    return;
  }
  starvationCount++;
  console.log(`nextTick iteration: ${starvationCount}`);

  // KEY LINE: scheduling another nextTick from within a nextTick
  // This re-queues before the event loop can process setTimeout
  process.nextTick(recursiveNextTick);
}

process.nextTick(recursiveNextTick);

/**
 * EXPECTED OUTPUT:
 *   === DEMO 1: nextTick Starvation ===
 *   setTimeout scheduled — will it ever fire?
 *
 *   nextTick iteration: 1
 *   nextTick iteration: 2
 *   nextTick iteration: 3
 *   nextTick iteration: 4
 *   nextTick iteration: 5
 *   nextTick called 5 times — stopping to let event loop breathe
 *   setTimeout fired! (only because we stopped nextTick recursion)
 */

// ─────────────────────────────────────────────
// DEMO 2: Safe pattern — use setImmediate instead
// ─────────────────────────────────────────────

/**
 * HOW TO FIX STARVATION:
 *   Replace recursive process.nextTick() with setImmediate().
 *   setImmediate() yields to the event loop after each callback,
 *   allowing I/O and timers to fire between iterations.
 *
 *   BAD  (starves event loop):
 *     function recurse() { process.nextTick(recurse); }
 *
 *   GOOD (yields to event loop each time):
 *     function recurse() { setImmediate(recurse); }
 */

/**
 * INTERVIEW EXPLAINER:
 *
 *   Q: "What is process.nextTick() and when should you use it?"
 *
 *   A: process.nextTick() schedules a callback to run after the current
 *      operation completes but before the event loop continues. It's useful
 *      when you want to ensure a callback fires asynchronously but with higher
 *      priority than I/O or timers — for example, emitting an 'error' event
 *      after a constructor returns, so the caller has time to attach a listener.
 *
 *   Q: "What's the danger of process.nextTick()?"
 *
 *   A: If nextTick callbacks keep scheduling more nextTick callbacks, the
 *      nextTick queue never empties. The event loop is stuck draining it and
 *      can never move to I/O, timers, or Promise callbacks. This is called
 *      "starvation." The fix is to use setImmediate() for recursive async work,
 *      since setImmediate yields back to the event loop after each callback.
 *
 *   Q: "Real-world scenario where nextTick is used correctly?"
 *
 *   A: Node.js core uses it when a function that could be synchronous OR
 *      asynchronous needs to guarantee async behavior. Example:
 *
 *        function readData(cb) {
 *          if (cache) {
 *            process.nextTick(() => cb(null, cache)); // always async
 *          } else {
 *            fs.readFile(path, cb);
 *          }
 *        }
 *
 *      Without nextTick, the callback would fire synchronously when cache exists,
 *      causing "releasing Zalgo" — unpredictable sync/async behavior.
 */