/**
 * FILE: macrotask-vs-microtask.js
 *
 * CONCEPT: Macrotask vs Microtask Execution Order
 *
 * INTERVIEW RELEVANCE:
 *   One of the most common Node.js interview questions is:
 *   "What is the output of this code?" — followed by a mix of
 *   setTimeout, Promise, and process.nextTick calls.
 *   Understanding this order is non-negotiable for senior roles.
 *
 * THE RULE (memorize this):
 *   1. Synchronous code runs first (call stack)
 *   2. process.nextTick() callbacks (nextTick queue — highest microtask priority)
 *   3. Promise callbacks (.then / .catch / queueMicrotask) (microtask queue)
 *   4. Macrotasks (setTimeout, setInterval, setImmediate, I/O callbacks)
 *
 * VISUAL ORDER:
 *   [Call Stack] → [nextTick Queue] → [Microtask Queue] → [Macrotask Queue]
 *
 * RUN: node macrotask-vs-microtask.js
 */

console.log("1. Synchronous — START"); // Runs immediately on call stack

// --- MACROTASK: goes into the macrotask queue, runs LAST ---
setTimeout(() => {
  console.log("5. Macrotask — setTimeout (0ms)");
}, 0);

// --- MICROTASK: Promise.resolve().then() goes into microtask queue ---
Promise.resolve().then(() => {
  console.log("3. Microtask — Promise.resolve().then()");
});

// --- HIGHEST PRIORITY MICROTASK: process.nextTick runs before Promises ---
process.nextTick(() => {
  console.log("2. nextTick — process.nextTick()");
});

// --- MICROTASK: queueMicrotask is equivalent to Promise.then priority ---
queueMicrotask(() => {
  console.log("4. Microtask — queueMicrotask()");
});

console.log("1. Synchronous — END"); // Still synchronous, runs before anything async

/**
 * EXPECTED OUTPUT:
 *   1. Synchronous — START
 *   1. Synchronous — END
 *   2. nextTick — process.nextTick()
 *   3. Microtask — Promise.resolve().then()
 *   4. Microtask — queueMicrotask()
 *   5. Macrotask — setTimeout (0ms)
 *
 * WHY THIS ORDER?
 *   - The call stack clears first (both console.logs)
 *   - Node drains the nextTick queue completely before moving on
 *   - Then it drains the microtask queue (Promises, queueMicrotask)
 *   - Only then does it pick the next macrotask (setTimeout callback)
 *
 * INTERVIEW EXPLAINER:
 *   Q: "What's the difference between a microtask and a macrotask?"
 *
 *   A: Microtasks (Promises, queueMicrotask, process.nextTick) are processed
 *      immediately after the current call stack is empty — before the event loop
 *      moves to the next iteration. Macrotasks (setTimeout, setInterval, I/O)
 *      are scheduled for the NEXT iteration of the event loop.
 *
 *      process.nextTick is technically NOT a microtask per the spec, but Node.js
 *      processes it with even higher priority than Promises — before the microtask
 *      queue runs.
 *
 *   Q: "Can microtasks starve macrotasks?"
 *
 *   A: Yes. If you keep adding microtasks inside microtask callbacks, the event
 *      loop will never reach the macrotask queue. See nexttick-starvation.js.
 */ 