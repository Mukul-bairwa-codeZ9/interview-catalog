/**
 * FILE: worker-thread-offload.js
 *
 * CONCEPT: Offloading CPU-Heavy Work to a Worker Thread
 *
 * INTERVIEW RELEVANCE:
 *   Senior Node.js interviews often ask:
 *   "How do you handle CPU-intensive tasks without blocking the event loop?"
 *   The answer is Worker Threads — and this file shows exactly how.
 *
 * THE PROBLEM:
 *   Node.js runs JavaScript on a single thread. The event loop handles all
 *   I/O, timers, and callbacks on this thread. A CPU-heavy task (e.g., image
 *   processing, cryptography, ML inference) running on the main thread BLOCKS
 *   the event loop — no requests can be served while it runs.
 *
 * THE SOLUTION:
 *   worker_threads (built into Node.js since v10.5, stable since v12) lets you
 *   spin up true OS-level threads. The CPU work runs in the Worker thread.
 *   The main thread's event loop stays free to handle incoming requests.
 *
 * HOW THIS FILE WORKS:
 *   We use the isMainThread flag to split one file into two logical roles:
 *   - When run directly → acts as the Main Thread
 *   - When spawned as a worker → acts as the Worker Thread
 *
 * RUN: node worker-thread-offload.js
 */

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

// ─────────────────────────────────────────────
// WORKER THREAD LOGIC
// Runs only when this file is spawned as a worker
// ─────────────────────────────────────────────

if (!isMainThread) {
  // We are inside the Worker thread now — completely separate JS environment
  // The main thread's event loop is NOT blocked while this runs

  const { iterations } = workerData; // data passed from the main thread

  console.log(`[Worker] Started — will compute ${iterations} iterations`);

  // Simulate a CPU-intensive task (e.g., hashing, compression, data processing)
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i); // heavy math, purely CPU-bound
  }

  console.log(`[Worker] Done computing. Result: ${result.toFixed(2)}`);

  // Send the result back to the main thread via message passing
  // Worker threads communicate through message channels — no shared memory by default
  parentPort.postMessage({ result });

  // Worker exits automatically when this script finishes
}

// ─────────────────────────────────────────────
// MAIN THREAD LOGIC
// Runs when you execute: node worker-thread-offload.js
// ─────────────────────────────────────────────

if (isMainThread) {
  console.log("[Main] Event loop is running — spawning a Worker thread...\n");

  // Spawn a Worker using THIS same file
  // The worker will enter the `if (!isMainThread)` block above
  const worker = new Worker(__filename, {
    workerData: {
      iterations: 100_000_000, // 100 million iterations — would freeze main thread if run here
    },
  });

  // Prove the main thread event loop is NOT blocked while the worker runs
  // This interval fires every 200ms — if the event loop were blocked, it would stall
  let tick = 0;
  const heartbeat = setInterval(() => {
    tick++;
    console.log(`[Main] Event loop heartbeat #${tick} — still alive while Worker is computing`);
  }, 200);

  // Receive the result when the worker is done
  worker.on("message", (msg) => {
    console.log(`\n[Main] Received result from Worker: ${msg.result.toFixed(2)}`);
  });

  // Clean up after the worker finishes
  worker.on("exit", (code) => {
    clearInterval(heartbeat); // stop the heartbeat timer
    console.log(`[Main] Worker exited with code ${code}`);
    console.log("[Main] Event loop is free. No blocking occurred.");
  });

  // Handle worker errors (always do this in production)
  worker.on("error", (err) => {
    clearInterval(heartbeat);
    console.error("[Main] Worker error:", err);
  });
}

/**
 * EXPECTED OUTPUT (approximate — heartbeat count varies by machine speed):
 *
 *   [Main] Event loop is running — spawning a Worker thread...
 *
 *   [Main] Event loop heartbeat #1 — still alive while Worker is computing
 *   [Main] Event loop heartbeat #2 — still alive while Worker is computing
 *   [Worker] Started — will compute 100000000 iterations
 *   [Main] Event loop heartbeat #3 — still alive while Worker is computing
 *   [Worker] Done computing. Result: 21081851083600.55
 *
 *   [Main] Received result from Worker: 21081851083600.55
 *   [Main] Worker exited with code 0
 *   [Main] Event loop is free. No blocking occurred.
 *
 * KEY OBSERVATION:
 *   The heartbeat keeps firing while the worker computes.
 *   If you moved the for-loop to the main thread, the heartbeat would STALL.
 */

/**
 * INTERVIEW EXPLAINER:
 *
 *   Q: "How does Node.js handle CPU-intensive tasks?"
 *
 *   A: By default, it doesn't handle them well — Node.js is single-threaded,
 *      so a CPU-heavy loop blocks the entire event loop, including all incoming
 *      HTTP requests. The solution is worker_threads. Workers run in true OS
 *      threads with their own V8 instance and event loop. They communicate with
 *      the main thread via message passing (postMessage / on('message')).
 *      This keeps the main event loop free while heavy computation runs in parallel.
 *
 *   Q: "What's the difference between Worker Threads and child_process.fork()?"
 *
 *   A: Both achieve parallelism, but differently.
 *      - child_process.fork() spawns a new Node.js process — separate memory,
 *        heavier overhead, communicates via IPC (inter-process communication).
 *      - Worker Threads spawn a thread within the same process — they can share
 *        memory using SharedArrayBuffer, have lower startup overhead, and are
 *        better suited for compute tasks that need to share data efficiently.
 *
 *   Q: "Can Worker Threads share memory?"
 *
 *   A: Yes, via SharedArrayBuffer and Atomics. By default, data passed via
 *      postMessage is copied (structured clone). But you can pass a
 *      SharedArrayBuffer to avoid copying — useful for large datasets.
 *      Atomics ensure safe concurrent reads/writes to shared memory.
 *
 *   Q: "When would you NOT use Worker Threads?"
 *
 *   A: For I/O-bound tasks. Node's async I/O (libuv thread pool) already handles
 *      those efficiently without blocking the event loop. Worker Threads are
 *      specifically for CPU-bound work: encryption, image resizing, parsing large
 *      files, ML inference, etc.
 */