# Event Loop Phases — Concepts

> Plain-English explanations for all 4 core phases. Read these alongside the SVG visuals.

---

## What is the Event Loop?

JavaScript is **single-threaded** — it can only execute one piece of code at a time. The **event loop** is what allows JavaScript to perform **non-blocking I/O operations** (like fetching data, reading files, or setting timers) by offloading them to the browser/Node.js APIs and then queuing callbacks to run later.

The event loop continuously checks:
1. Is the **call stack** empty?
2. If yes → move tasks from the **queues** to the call stack

---

## The 4 Main Phases

### 1. Timers Phase
**What runs here:** `setTimeout()` and `setInterval()` callbacks

```js
setTimeout(() => console.log("timeout"), 0);
```

- Callbacks execute **after the specified delay has passed**
- `setTimeout(fn, 0)` doesn't mean "run immediately" — it runs after the minimum delay (4ms in browsers)

---

### 2. Pending Callbacks Phase
**What runs here:** I/O callbacks (except timers, close callbacks)

```js
// In Node.js:
fs.readFile("file.txt", (err, data) => {
  console.log("file read");
});
```

- System-level operations like OS callbacks
- Executed during this phase

---

### 3. Idle/Prepare Phase
**What runs here:** Internal system operations

- Used by Node.js for internal housekeeping
- Developers rarely interact with this phase directly
- Happens automatically between other phases

---

### 4. Poll Phase (Most Important!)
**What runs here:** I/O callbacks (except timers), new callbacks queued during poll

```js
// Poll phase gets new I/O callbacks
setImmediate(() => console.log("immediate"));

// Poll phase executes them here
```

**Key behaviors:**
- Executes callbacks queued in the **poll queue**
- If poll queue is empty → wait for new callbacks OR proceed to **check phase**
- If `setImmediate()` is queued → stop polling and move to check phase

---

### 5. Check Phase
**What runs here:** `setImmediate()` callbacks

```js
setImmediate(() => console.log("immediate callback"));
```

- Runs **after poll phase** completes
- Executes all `setImmediate()` callbacks queued

---

### 6. Close Callbacks Phase
**What runs here:** Close event callbacks

```js
server.on("close", () => console.log("server closed"));
socket.on("close", () => console.log("socket closed"));
```

- Callbacks for closed connections (e.g., `socket.on('close')`, `server.on('close')`)

---

## Event Loop Execution Order Example

```js
console.log("1. sync");

setTimeout(() => console.log("2. timeout"), 0);

setImmediate(() => console.log("3. immediate"));

Promise.resolve().then(() => console.log("4. microtask"));

console.log("5. sync");
```

**Output:**

sync

sync

microtask

timeout

immediate



### Why this order?

| Priority | Queue Type | What Runs |
|----------|-----------|-----------|
| 1️⃣ | **Call Stack** | Synchronous code |
| 2️⃣ | **Microtask Queue** | Promises, `process.nextTick()` |
| 3️⃣ | **Macrotask Queue** | `setTimeout`, `setInterval`, `setImmediate`, I/O |

---

## Microtasks vs Macrotasks

### Microtask Queue (Higher Priority)
- `Promise.then()/catch()/finally()`
- `queueMicrotask()`
- `process.nextTick()` (Node.js)
- **Runs after sync code, before any macrotask**

### Macrotask Queue (Lower Priority)
- `setTimeout()`, `setInterval()`
- `setImmediate()` (Node.js)
- I/O callbacks
- UI rendering
- **Runs one at a time per event loop iteration**

```js
setTimeout(() => console.log("timeout"), 0);
setImmediate(() => console.log("immediate"));

// In browser: timeout first, then immediate
// In Node.js: order may vary depending on context
```

---

## Visual Flow
┌───────────────────────────┐
│ Call Stack │
│ (Sync code runs) │
└───────────┬───────────────┘
│ Stack empty?
▼
┌───────────────────────────┐
│ Microtask Queue │
│ (Promises, nextTick) │
│ → Run ALL microtasks │
└───────────┬───────────────┘
│ Microtasks empty?
▼
┌───────────────────────────┐
│ Macrotask Queue │
│ → Run ONE macrotask │
│ (setTimeout, setImmediate)
└───────────┬───────────────┘
│ Back to start
└───────────────┘





---

## 💡 One-Liner for Interviews

> **The event loop is JavaScript's mechanism that continuously monitors the call stack and task queues, moving callbacks from microtask/macrotask queues to the call stack when the stack is empty, enabling non-blocking asynchronous behavior.**

### Alternative shorter version:

> **The event loop is what allows JavaScript to handle async operations by executing callbacks from queues (microtasks first, then macrotasks) whenever the call stack is empty.**

---

## Key Takeaways

| Concept | Rule |
|---------|------|
| **Sync code** | Runs first on call stack |
| **Microtasks** | Run after sync, before macrotasks |
| **Macrotasks** | Run one at a time per loop iteration |
| **`setTimeout(fn, 0)`** | Runs in next macrotask cycle, not immediately |
| **`setImmediate()`** | Runs in check phase (after poll phase) |
| **Promises** | Higher priority than `setTimeout`/`setImmediate` |