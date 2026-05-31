# Microtask Queue — Concepts

> Plain-English explanations for the core concept. Read this alongside the SVG visuals.

---

## 1. Microtask Queue

The **Microtask Queue** is where high-priority callbacks (from Promises and other microtasks) wait until they can be executed.

### What is a Microtask Queue?

The **Microtask Queue** is a data structure that stores callback functions from Promise-based operations and other microtasks, waiting for the call stack to be empty before they can run. It follows a **FIFO (First In, First Out)** order and has **higher priority** than the Callback Queue .

- When a Promise settles (`.then()`, `.catch()`, `.finally()`) → its callback is **queued** into the Microtask Queue
- The **Event Loop** constantly checks: _"Is the call stack empty?"_
- If **yes** → Event Loop **empties the entire microtask queue** before moving to the callback queue 
- All microtasks run **before** any callback queue task 

### What Goes Into the Microtask Queue?

| Operation | Callback Source |
|-----------|-----------------|
| `Promise.then()` | Promise resolved/rejected  |
| `Promise.catch()` | Promise rejected  |
| `Promise.finally()` | Promise settled  |
| `async/await` | After `await` expression  |
| `MutationObserver` | DOM mutations  |
| `queueMicrotask()` | Explicit microtask  |

### Visual Flow

```js
console.log("1");

setTimeout(() => console.log("2"), 0);

Promise.resolve().then(() => console.log("3"));

console.log("4");

// Execution order:
// 1. console.log("1") → Stack → Output: "1" → Pops
// 2. console.log("4") → Stack → Output: "4" → Pops
// 3. Stack empty → Event Loop checks microtask queue
// 4. Promise callback → Stack → Output: "3" → Pops
// 5. Microtask queue empty → Event Loop checks callback queue
// 6. setTimeout callback → Stack → Output: "2" → Pops

// Output: 1, 4, 3, 2
```

### Microtask Queue vs Callback Queue

| Aspect | Microtask Queue | Callback Queue |
|--------|-----------------|----------------|
| **Also called** | Job Queue | Task Queue, Ma