# Callback Queue — Concepts

> Plain-English explanations for the core concept. Read this alongside the SVG visuals.

---

## 1. Callback Queue
The **Callback Queue** (also called **Task Queue** or **Macrotask Queue**) is where asynchronous callbacks wait until they can be executed.

### What is a Callback Queue?

The **Callback Queue** is a data structure that stores callback functions from completed asynchronous operations, waiting for the call stack to be empty before they can run. It follows a **FIFO (First In, First Out)** order — the first callback added is the first one executed .

- When an asynchronous operation completes (e.g., `setTimeout`, network request, click event) → its callback is **queued** into the Callback Queue.
- The **Event Loop** constantly checks: _"Is the call stack empty?"_
- If **yes** → Event Loop pushes the **first callback** from the queue to the call stack
- If **no** → Callback waits in the queue until the stack clears 

### What Goes Into the Callback Queue?

| Async Operation | Callback Source |
|-----------------|-----------------|
| `setTimeout()` | Timer expires  |
| `setInterval()` | Timer interval  |
| DOM events | Click, submit, keypress  |
| Network requests | `XMLHttpRequest`, `fetch` (older APIs)  |
| File I/O | Node.js file operations |

### Visual Flow
📎 Visual: `callback-queue/callback-queue.svg`


setTimeout(() => console.log("Hello"), 0);
console.log("World");

// 1. setTimeout callback → Callback Queue (timer expires immediately)
// 2. console.log("World") → Call Stack → executes → pops
// 3. Call stack empty → Event Loop moves queue callback to stack
// 4. console.log("Hello") → executes → pops

// Output: "World" then "Hello"