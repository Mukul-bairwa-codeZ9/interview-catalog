# Node.js Event Loop — Easy Interview Questions

---

## Q1. What is the Node.js Event Loop?

**Answer:**
The Event Loop is the mechanism that allows Node.js to perform non-blocking I/O operations despite JavaScript being single-threaded. It continuously monitors if the Call Stack is empty, and if so, picks up the next task from the queues (timers, I/O callbacks, microtasks, etc.) and pushes it onto the stack for execution. This is what makes Node.js capable of handling thousands of concurrent connections without spawning a thread per request.

**Key point:** The Event Loop is not part of V8 — it's provided by **libuv**, the C library that powers Node.js's async I/O.

---

## Q2. What is the Call Stack?

**Answer:**
The Call Stack is a LIFO (Last In, First Out) data structure that tracks the currently executing functions. When you call a function, it's pushed onto the stack. When it returns, it's popped off. JavaScript can only execute one thing at a time — whatever is currently on top of the Call Stack. If the stack is busy (e.g., a long loop), the Event Loop cannot process any queued callbacks — this is called "blocking the Event Loop."

**Key point:** The Call Stack is synchronous and single-threaded — only one frame executes at a time.

---

## Q3. What is the difference between synchronous and asynchronous code in Node.js?

**Answer:**
Synchronous code executes line by line and blocks the Call Stack until it completes. Asynchronous code (like `fs.readFile`, `setTimeout`, or a `fetch`) is handed off to the system (via libuv or the browser APIs), and a callback is registered to run later — once the result is ready and the Call Stack is empty. This means async operations don't block the Event Loop while waiting.

**Key point:** Async code doesn't run "in parallel" in JS — it just defers execution until the stack is free.

---

## Q4. What is a callback? Give a simple example.

**Answer:**
A callback is a function passed as an argument to another function, intended to be called later — usually after an async operation completes. Node.js uses the **error-first callback convention**: the first argument is an error (or `null`), and the second is the result.

```js
const fs = require('fs');

fs.readFile('file.txt', 'utf8', (err, data) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('File contents:', data);
});

console.log('This runs BEFORE the file is read');
``` 

The `console.log` at the bottom runs first because `readFile` is async — the callback runs later when the file is ready.

**Key point:** Callbacks are the original async primitive in Node.js — Promises and async/await are built on top of them.

---

## Q5. What does `setTimeout(fn, 0)` actually do?

**Answer:**
It schedules `fn` to run after a **minimum** delay of 0ms — but it does NOT run immediately. The callback is placed in the **timers queue** (a macrotask queue), which the Event Loop only checks after the current Call Stack is empty and all microtasks (Promises, `process.nextTick`) have been flushed. In practice, the actual delay is often 1–4ms due to OS and libuv timer resolution.

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
console.log('3');
// Output: 1, 3, 2
```

**Key point:** `setTimeout(fn, 0)` means "run this after the current execution and all microtasks — not right now."