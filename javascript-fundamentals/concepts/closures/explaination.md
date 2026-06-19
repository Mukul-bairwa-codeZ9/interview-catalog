# Closures

## Overview
A **closure** is a function that "remembers" the variables from its lexical scope, even after the outer function has finished executing. This is one of the most-asked JS interview topics because it tests whether you understand the relationship between **scope, memory, and function execution** — not just whether you can recite the definition.

**One-line definition to say out loud:** "A closure is the combination of a function bundled together with references to its surrounding lexical scope."

---

## The Basic Mechanism
```js
function outer() {
  let count = 0;
  function inner() {
    count++;
    console.log(count);
  }
  return inner;
}

const counter = outer();
counter(); // 1
counter(); // 2
counter(); // 3
```
**Why this works:** When `outer()` runs and returns `inner`, normally `count` would be garbage-collected since `outer`'s execution context is popped off the call stack. But `inner` holds a **reference** to the variable environment of `outer` (not a copy of the value) — so as long as `inner` exists, `count` stays alive in memory. Each call to `counter()` mutates the *same* `count`, which is why it keeps incrementing instead of resetting.

---

## Interview Traps

### Trap 1: The classic loop closure bug (var vs let — ties directly to var/let/const topic)
```js
function createFunctions() {
  var fns = [];
  for (var i = 0; i < 3; i++) {
    fns.push(function () { console.log(i); });
  }
  return fns;
}
const fns = createFunctions();
fns[0](); // 3
fns[1](); // 3
fns[2](); // 3
```
**Why:** All three functions close over the **same** `i` (function-scoped, due to `var`). By the time any of them are called, the loop has finished and `i` is `3`.

**Fix with `let`:**
```js
for (let i = 0; i < 3; i++) {
  fns.push(function () { console.log(i); });
}
// 0, 1, 2 — each iteration gets its own `i` binding, so each closure captures a different value
```
**Fix with `var` using an IIFE (pre-ES6 technique, good to mention you know it):**
```js
for (var i = 0; i < 3; i++) {
  (function (j) {
    fns.push(function () { console.log(j); });
  })(i);
}
```

### Trap 2: Closures capture variables by reference, not by value (snapshot)
```js
function makeAdder(x) {
  return function (y) {
    return x + y;
  };
}
const add5 = makeAdder(5);
console.log(add5(2)); // 7
console.log(add5(10)); // 15
```
Here `x` is captured once and never changes — fine. But if the outer variable *does* change after the closure is created, the closure sees the **updated** value, not a frozen snapshot:
```js
function outer() {
  let value = "initial";
  function readValue() { console.log(value); }
  value = "changed";
  return readValue;
}
outer()(); // "changed" — NOT "initial"
```
**Why:** The closure holds a live reference to the variable's location in memory, not a copy of its value at creation time.

### Trap 3: Memory leaks from closures
```js
function attachListener() {
  const hugeData = new Array(1000000).fill("data");
  document.getElementById("btn").addEventListener("click", function () {
    console.log("clicked"); // doesn't even use hugeData...
  });
  // ...but if hugeData were referenced inside the listener, it would
  // stay in memory for as long as the listener exists, since closures
  // keep their entire enclosing scope alive, not just the variables used.
}
```
**Why this is asked:** Senior-level interviews probe whether you know closures can unintentionally keep large objects alive in memory if they're in the same scope as a long-lived closure (e.g., event listeners, timers). Mitigate by nullifying references you no longer need, or keeping the closure's enclosing scope minimal.

---

## Practical Use Cases (interviewers ask "where would you use this?")

### 1. Data privacy / module pattern (before ES6 classes existed)
```js
function createBankAccount(initialBalance) {
  let balance = initialBalance; // private — no direct external access
  return {
    deposit(amount) { balance += amount; return balance; },
    withdraw(amount) { balance -= amount; return balance; },
    getBalance() { return balance; }
  };
}
const account = createBankAccount(100);
account.deposit(50);
console.log(account.getBalance()); // 150
console.log(account.balance); // undefined — truly private, can't be accessed directly
```

### 2. Function factories / partial application
```js
function multiplyBy(x) {
  return function (y) {
    return x * y;
  };
}
const double = multiplyBy(2);
const triple = multiplyBy(3);
console.log(double(5)); // 10
console.log(triple(5)); // 15
```

### 3. Memoization / caching
```js
function memoizedSquare() {
  const cache = {};
  return function (n) {
    if (n in cache) {
      console.log("from cache");
      return cache[n];
    }
    cache[n] = n * n;
    return cache[n];
  };
}
const square = memoizedSquare();
square(4); // computes, caches
square(4); // "from cache"
```

### 4. Debounce / throttle (extremely common interview live-coding question)
```js
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
// `timer` persists across calls because the returned function closes over it
const debouncedSearch = debounce((query) => console.log("Searching:", query), 300);
```

---

## Interview Answer Template
> "A closure is when a function retains access to its outer lexical scope even after the outer function has returned. This works because JS keeps the variable environment alive in memory as long as something still references it — in this case, the inner function. I use closures most often for data privacy via the module pattern, function factories, memoization, and debounce/throttle implementations. A common gotcha is closures in loops with `var`, where every closure shares the same variable instead of capturing a snapshot — `let`'s per-iteration binding fixes that. I also keep in mind that closures can cause memory leaks if they hold references to large objects that are no longer needed."