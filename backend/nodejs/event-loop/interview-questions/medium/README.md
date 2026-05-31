# Node.js Event Loop — Medium Interview Questions

---

## Q1. What is the difference between the Callback Queue (Macrotask Queue) and the Microtask Queue?

### Answer

JavaScript uses different queues to manage asynchronous tasks.

#### Callback Queue (Macrotask Queue)
Stores callbacks from:
- `setTimeout()`
- `setInterval()`
- I/O operations
- `setImmediate()` (Node.js)

#### Microtask Queue
Stores callbacks from:
- `Promise.then()`
- `Promise.catch()`
- `Promise.finally()`
- `process.nextTick()` (Node.js)

### Important Difference

The **Microtask Queue always has higher priority** than the Callback Queue.

When JavaScript finishes executing the current code:
1. It executes all pending microtasks.
2. Then it executes the next macrotask.

### Example

```js
setTimeout(() => console.log("macrotask"), 0);

Promise.resolve().then(() => {
  console.log("microtask");
});
```

### Output

```js
microtask
macrotask
```

### Key Point

> Microtasks (Promises, `process.nextTick`) are always executed before macrotasks (`setTimeout`, I/O callbacks). The Event Loop drains the entire Microtask Queue before moving to the next Macrotask.
---

## Q2. Which has higher priority — Promises or `setTimeout`? Why?

**Answer:**
Promises have higher priority. Resolved Promise callbacks go into the **microtask queue**, which is drained completely after every task (and after every Event Loop phase transition). `setTimeout` callbacks go into the **timers queue** (macrotask), which is only processed once per Event Loop iteration. So even a `setTimeout(fn, 0)` will always run after all pending Promise callbacks.

```js
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
// Output: promise, timeout
```

**Key point:** Microtask queue (Promises) > Macrotask queue (setTimeout) — always.

---

## Q3. What are the phases of the Node.js Event Loop?

**Answer:**
The Node.js Event Loop (powered by libuv) runs through these phases in order, each time it loops:

| Phase | What it handles |
|---|---|
| **Timers** | `setTimeout` and `setInterval` callbacks whose delay has expired |
| **Pending Callbacks** | I/O callbacks deferred from the previous iteration |
| **Idle / Prepare** | Internal libuv use only |
| **Poll** | Retrieve new I/O events; execute I/O callbacks. Blocks here if queue is empty and no timers are pending |
| **Check** | `setImmediate` callbacks |
| **Close Callbacks** | Cleanup callbacks like `socket.on('close', ...)` |

After each phase, Node.js drains the **microtask queue** (first `process.nextTick`, then Promises) before moving to the next phase.

**Key point:** The Poll phase is where Node.js spends most of its idle time — waiting for I/O events.

---

## Q4. What is `process.nextTick()` and how does it differ from `Promise.then()`?

### Answer

`process.nextTick()` is a Node.js-specific API that schedules a callback to run immediately after the current operation completes, before the Event Loop continues to the next phase.

Although both `process.nextTick()` and `Promise.then()` are asynchronous, Node.js maintains a separate **Next Tick Queue** that has a higher priority than the Promise Microtask Queue.

When the current call stack becomes empty, Node.js processes tasks in this order:

1. `process.nextTick()` queue
2. Promise Microtask Queue (`.then()`, `.catch()`, `.finally()`)
3. Event Loop phases (timers, I/O, etc.)

Because the Next Tick Queue is processed first, `process.nextTick()` callbacks always execute before Promise callbacks.

### Example

```js
Promise.resolve().then(() => {
  console.log("promise");
});

process.nextTick(() => {
  console.log("nextTick");
});
```

### Output

```js
nextTick
promise
```

### Why Does `process.nextTick()` Have Higher Priority?

Node.js introduced `process.nextTick()` before Promises existed. It was designed for internal operations that need to run immediately after the current function finishes, without waiting for the Event Loop to proceed.

To guarantee this behavior, Node.js always empties the Next Tick Queue before processing Promise microtasks or moving to the next Event Loop phase.

### Key Point

> `process.nextTick()` has higher priority because Node.js maintains a dedicated Next Tick Queue that is processed before the Promise Microtask Queue and before the Event Loop continues.

---

## Q5. What happens when you block the Event Loop? How do you avoid it?

**Answer:**
If synchronous code runs for too long on the Call Stack (e.g., a CPU-intensive loop, large JSON parse, or heavy regex), the Event Loop cannot process any pending I/O callbacks, timers, or incoming requests. In a web server this means all clients are frozen for the duration — high latency, timeouts, and poor throughput.

**How to avoid it:**
- Break large CPU tasks into chunks using `setImmediate` to yield between chunks
- Offload CPU-heavy work to **Worker Threads** (`worker_threads` module)
- Use **child processes** for truly isolated heavy computation
- For large JSON: consider streaming parsers instead of `JSON.parse` on giant strings

**Key point:** The Event Loop is only as fast as your slowest synchronous operation — never block it with CPU work in the main thread.

---

## Q6. What is the difference between `setImmediate()` and `setTimeout(fn, 0)`?

**Answer:**
Both schedule a callback to run "soon", but they run in different Event Loop phases. `setTimeout(fn, 0)` runs in the **Timers phase**, while `setImmediate` runs in the **Check phase** — which comes after the Poll phase. In practice, when both are called from within an I/O callback, `setImmediate` always fires first. When called from the main module (outside I/O), the order is non-deterministic and depends on OS timer resolution.

```js
// Inside an I/O callback — deterministic:
fs.readFile('file.txt', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
  // Always: immediate, timeout
});
```
setImmediate() does not accept a delay parameter.

You can pass arguments to the callback, but not a delay:

```js
setImmediate((name) => {
  console.log(name);
}, 'Mukul');
```

**Key point:** Inside I/O callbacks, prefer `setImmediate`

 when you want "run this after current I/O, before any timers."
 
 setImmediate() schedules a callback for the Check phase of the next Event Loop iteration and does not support delays. For delayed execution, use setTimeout().