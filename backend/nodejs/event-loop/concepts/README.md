# Event Loop — Concepts

> Plain-English explanations for all 4 core concepts. Read these alongside the SVG visuals.

---

## 1. Call Stack

JavaScript is **single-threaded** — it can only do one thing at a time.

The **call stack** is how JS tracks _where it is_ in your code.

- Every time you call a function → a **frame** is pushed onto the stack
- When the function returns → the frame is **popped** off
- The function at the **top** of the stack is currently running

```js
function main() { greet("Mukul"); }
function greet(name) { say("Hello " + name); }
function say(msg) { console.log(msg); }

main();
// Stack at peak: console.log → say → greet → main
```

**Stack overflow** = too many nested calls (infinite recursion fills the stack).

📎 Visual: `call-stack/call-stack.svg`

---

## 2. Callback Queue (Macro Task Queue)

When you call `setTimeout`, `setInterval`, or a file I/O function, JS doesn't wait.

It hands the work off to **Web APIs** (browser) or **libuv** (Node.js) and moves on.

When that work finishes, the callback goes into the **Callback Queue**.

The **Event Loop** checks: _"Is the call stack empty?"_
- Yes → move the next callback from the queue onto the stack
- No → keep waiting

```js
console.log("start");
setTimeout(() => console.log("timeout"), 0);
console.log("end");
// Output: start → end → timeout
```

`setTimeout(fn, 0)` does NOT run immediately. It queues `fn` — it runs only after the current stack clears.

📎 Visual: `callback-queue/callback-queue.svg`

---

## 3. Microtask Queue

Not all async work is equal. **Promises** and `queueMicrotask()` go into a **separate, higher-priority queue**.

**Priority order (per loop tick):**
1. Run current call stack to completion
2. Drain the **entire** microtask queue (all `.then()` chains)
3. Pick **one** callback from the macro task queue
4. Repeat

```js
console.log("A");
setTimeout(() => console.log("B"), 0);   // macro task
Promise.resolve().then(() => console.log("C")); // microtask

// Output: A → C → B
```

Even if a macro task was queued earlier, all microtasks run first.

**Microtask sources:** `Promise.then/catch/finally`, `queueMicrotask()`, `MutationObserver`

📎 Visual: `microtask-queue/microtask-queue.svg`

---

## 4. Event Loop Phases (Node.js / libuv)

In Node.js, the event loop is more structured than in browsers. It has **6 phases**:

| Phase | What runs | Key API |
|---|---|---|
| ① Timers | Expired setTimeout / setInterval | `setTimeout`, `setInterval` |
| ② Pending I/O | I/O error callbacks from last tick | (rare) |
| ③ Idle / Prepare | Internal Node.js use only | — |
| ④ Poll | Waits for new I/O events (blocking wait) | `fs.readFile`, `net` etc. |
| ⑤ Check | setImmediate callbacks | `setImmediate` |
| ⑥ Close Callbacks | socket close events etc. | `socket.on('close')` |

**Between every phase:** the full microtask queue is drained.

**Poll phase** is where the loop spends most of its time — it blocks and waits for I/O when there's nothing else to do.

```js
// Inside an I/O callback:
fs.readFile('file.txt', () => {
  setTimeout(() => console.log("timeout"), 0);
  setImmediate(() => console.log("immediate"));
});
// Output: immediate → timeout  (setImmediate wins inside I/O callbacks)
```

📎 Visual: `event-loop-phases/event-loop-phases.svg`

---

## The Full Picture

```
   Code runs
      ↓
   Call Stack  ←──────────────────────────────────────┐
      ↓ (empty)                                        │
   Microtask Queue drains fully                        │
      ↓ (empty)                                        │
   Event Loop picks next Macro Task (Callback Queue)   │
      ↓                                                │
   Push callback onto Call Stack ──────────────────────┘
```

**One-liner for interviews:**
> "The event loop lets JS do async work by offloading tasks to Web APIs, then picking up the results via the callback queue — always running microtasks before macro tasks."