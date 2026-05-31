# Node.js Event Loop — Advanced Interview Questions

---

## Q1. Trace the execution order: `setTimeout`, `setImmediate`, `Promise.then`, `process.nextTick`

**Answer:**
Given this code:

```js
setTimeout(() => console.log('A - setTimeout'), 0);
setImmediate(() => console.log('B - setImmediate'));
Promise.resolve().then(() => console.log('C - Promise'));
process.nextTick(() => console.log('D - nextTick'));
console.log('E - sync');
```

**Output:**
```
E - sync
D - nextTick
C - Promise
A - setTimeout   (or B first — non-deterministic outside I/O)
B - setImmediate
```

**Why:**
1. `E` runs synchronously first — it's on the Call Stack
2. After the stack clears, microtasks flush: `nextTick` queue first (`D`), then Promise queue (`C`)
3. Event Loop enters Timers phase → `setTimeout` fires (`A`)
4. Event Loop enters Check phase → `setImmediate` fires (`B`)

Note: `A` and `B` order can swap when run from the main module due to OS timer resolution. Inside an I/O callback, `setImmediate` always wins.

**Key point:** Sync → nextTick → Promise → macrotasks (timers/setImmediate in phase order).

---

## Q2. What are libuv thread pools? What operations use them?

**Answer:**
Node.js is single-threaded for JavaScript, but libuv maintains a **thread pool** (default size: 4 threads) to handle operations that can't be done asynchronously at the OS level. When these operations complete, their callbacks are queued in the Event Loop.

**Operations that use the thread pool:**
- File system operations (`fs.readFile`, `fs.stat`, etc.)
- DNS resolution (`dns.lookup` — but NOT `dns.resolve`)
- Crypto operations (`crypto.pbkdf2`, `crypto.scrypt`, `crypto.randomBytes`)
- Zlib compression (`zlib.gzip`, etc.)
- User-defined C++ addons that use the pool

**Operations that do NOT use the thread pool (handled by OS async APIs):**
- TCP/UDP networking (uses OS-level epoll/kqueue/IOCP)
- Timers, `setImmediate`

You can change the pool size with `UV_THREADPOOL_SIZE` env var (max 1024).

**Key point:** The thread pool is why I/O doesn't block Node — but it's a shared resource. If all 4 threads are busy, subsequent I/O operations queue up and wait.

---

## Q3. What is starvation in the context of `process.nextTick()`? How can it happen?

**Answer:**
Starvation happens when `process.nextTick()` callbacks keep re-scheduling themselves recursively, causing the microtask queue to never fully drain — which prevents the Event Loop from ever advancing to I/O, timers, or Promise callbacks.

```js
// This starves the Event Loop — never reaches the timer
function recursive() {
  process.nextTick(recursive);
}
recursive();
setTimeout(() => console.log('never runs'), 0);
```

Because `process.nextTick` callbacks are processed before the Event Loop moves to any next phase, a recursive `nextTick` creates an infinite microtask loop. The same problem can occur with recursive `Promise.then`, though `nextTick` is more dangerous since it has even higher priority.

**How to avoid it:**
- Never recursively schedule `process.nextTick` without a termination condition
- Prefer `setImmediate` for recursive async patterns — it yields to the Event Loop between iterations

**Key point:** `process.nextTick` starvation blocks everything — I/O, timers, and incoming requests all freeze.

---

## Q4. How does Node.js handle I/O under the hood?

**Answer:**
When you call something like `fs.readFile()`:

1. Node.js passes the request to **libuv**
2. libuv checks if the OS supports async I/O for that operation:
   - **Networking (TCP/UDP):** Uses OS-level async APIs — `epoll` (Linux), `kqueue` (macOS), `IOCP` (Windows). No thread needed.
   - **File system:** Most OS file APIs are blocking, so libuv delegates to its **thread pool**. A worker thread performs the blocking read and signals completion.
3. When the operation completes, libuv places the callback in the **Poll phase queue**
4. The Event Loop picks it up in the Poll phase and executes it on the main thread

This architecture means Node.js can handle thousands of concurrent network connections (OS handles them async) while also doing file I/O (thread pool handles blocking calls), all without the developer managing threads.

**Key point:** Node.js async I/O = OS-level async for network + libuv thread pool for file/crypto. The Event Loop just coordinates callbacks.

---

## Q5. How would you diagnose and fix Event Loop lag in a production Node.js service?

**Answer:**

**Diagnosing:**
- Use `perf_hooks` to measure Event Loop delay:
  ```js
  const { monitorEventLoopDelay } = require('perf_hooks');
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  setInterval(() => {
    console.log('EL delay (ms):', h.mean / 1e6);
  }, 1000);
  ```
- Use **Clinic.js** (`clinic doctor`, `clinic flame`) for flame graphs showing where CPU time is spent
- Use `--prof` V8 profiler flag + `node --prof-process` to analyze hot functions
- Monitor with APM tools (Datadog, New Relic) — they expose event loop lag as a metric

**Fixing:**
| Root Cause | Fix |
|---|---|
| CPU-heavy computation | Offload to **Worker Threads** or child processes |
| Large synchronous JSON parsing | Use streaming JSON parsers (e.g., `stream-json`) |
| Heavy regex or string ops | Move to a worker or cache results |
| Blocking DB/HTTP calls in a loop | Use `Promise.all` to parallelize, not sequential `await` |
| Too many `process.nextTick` | Replace with `setImmediate` to yield to Event Loop |

**Key point:** You can't fix what you don't measure — always profile first. The fix is almost always: move CPU work off the main thread.