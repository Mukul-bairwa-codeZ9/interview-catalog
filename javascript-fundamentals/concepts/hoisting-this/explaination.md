# Hoisting and the `this` Keyword

## Overview
Hoisting explains *when* declarations become available; `this` explains *what context* a function runs in. Both are top-tier interview topics because they require understanding how the JS engine actually executes code, not just reading syntax top-to-bottom.

---

## Part 1: Hoisting

**Hoisting** is JS's behavior of processing all variable and function declarations during the **creation phase** of an execution context, before any code actually runs line-by-line.

### var, let, const hoisting differences
```js
console.log(a); // undefined — hoisted, initialized to undefined
var a = 10;

console.log(b); // ReferenceError — in Temporal Dead Zone
let b = 10;

console.log(c); // ReferenceError — in Temporal Dead Zone
const c = 10;
```
**Why:** During the creation phase, the engine scans the scope and allocates memory for every declaration.
- `var` → allocated AND initialized to `undefined` immediately.
- `let`/`const` → allocated but left uninitialized, sitting in the **Temporal Dead Zone (TDZ)** until the actual declaration line executes.

### Function declarations vs function expressions
```js
sayHi(); // "Hi!" — works, fully hoisted
function sayHi() { console.log("Hi!"); }

sayBye(); // TypeError: sayBye is not a function
var sayBye = function() { console.log("Bye!"); };
```
**Why:** Function **declarations** are hoisted completely — both the name AND the function body. Function **expressions** assigned to a `var` only hoist the variable name (as `undefined`), not the function body, because the right-hand side is just a value assignment, which only happens at runtime in sequence.

### Trap: Hoisting inside blocks (function vs block scope confusion)
```js
if (true) {
  function test() { console.log("a"); }
}
test(); // works in non-strict mode (browser quirk), but unreliable —
        // behavior differs between strict mode/engines. Avoid declaring
        // functions inside blocks for this exact reason.
```

### Interview Answer Template (Hoisting)
> "Hoisting happens during the creation phase of an execution context — the engine scans for declarations before running any code. `var` declarations are hoisted and initialized to `undefined`, while `let`/`const` are hoisted but stay in the Temporal Dead Zone until their declaration line, throwing a ReferenceError if accessed early. Function declarations are hoisted with their full body, but function expressions only hoist the variable, not the assigned function — which is why calling a function expression before its definition throws a TypeError."

---

## Part 2: The `this` Keyword

`this` is **not** determined by where a function is defined — it's determined by **how a function is called** (its "call site"). This is the single most important rule to remember.

### Rule 1: Regular function call → `this` is the global object (or undefined in strict mode)
```js
function show() {
  console.log(this);
}
show(); // window (browser) / global (Node) in non-strict mode
        // undefined in strict mode ('use strict')
```

### Rule 2: Method call → `this` is the object before the dot
```js
const user = {
  name: "Mukul",
  greet() {
    console.log(this.name);
  }
};
user.greet(); // "Mukul" — this = user, because user.greet() was the call site
```

### Trap: Losing `this` when extracting a method
```js
const greetFn = user.greet;
greetFn(); // undefined (or error) — this is now the global object/undefined,
           // because the call site is just greetFn(), not tied to `user` anymore
```
**Why:** `this` binding is decided at call time, not definition time. Once you detach `greet` from `user` and call it standalone, there's no object before the dot anymore — so `this` falls back to Rule 1.

### Rule 3: Arrow functions → `this` is inherited lexically (from where they're defined)
```js
const user = {
  name: "Mukul",
  greet: () => {
    console.log(this.name); // undefined — arrow functions don't have their own `this`
  }
};
user.greet();
```
**Why:** Arrow functions don't create their own `this` binding at all — they capture `this` from the enclosing lexical scope at the time they're defined. Since this arrow function is defined at the top level (not inside another regular function), `this` refers to the outer/global scope, not `user`.

### Trap: Arrow functions fix the "this inside callback" problem
```js
const timer = {
  seconds: 0,
  start() {
    setInterval(function () {
      this.seconds++; // ❌ this = global object, NOT timer — bug!
      console.log(this.seconds);
    }, 1000);
  }
};

const timerFixed = {
  seconds: 0,
  start() {
    setInterval(() => {
      this.seconds++; // ✅ arrow function inherits `this` from start()'s scope, which is `timerFixed`
      console.log(this.seconds);
    }, 1000);
  }
};
```
**This is a very common real-world interview question** — "why use an arrow function inside a method's callback?"

### Rule 4: Explicit binding — call, apply, bind
```js
function greet() { console.log(this.name); }
const user = { name: "Mukul" };

greet.call(user);          // "Mukul" — calls immediately, args passed individually
greet.apply(user);         // "Mukul" — calls immediately, args passed as an array
const bound = greet.bind(user);
bound();                    // "Mukul" — returns a NEW function with this permanently bound
```
**Difference between call/apply/bind:**
- `call(thisArg, arg1, arg2)` — invokes immediately, arguments listed individually
- `apply(thisArg, [arg1, arg2])` — invokes immediately, arguments as an array
- `bind(thisArg)` — does NOT invoke; returns a new function with `this` permanently locked

### Rule 5: `new` keyword → `this` is the newly created object
```js
function Person(name) {
  this.name = name;
}
const p = new Person("Mukul");
console.log(p.name); // "Mukul"
```
**Why:** `new` creates a brand new empty object, sets `this` to point to it inside the constructor function, runs the function body (which attaches properties to `this`), and returns the object automatically.

### Priority order when multiple rules could apply (interviewers love asking this)
1. `new` binding (highest priority)
2. Explicit binding (`call`/`apply`/`bind`)
3. Implicit binding (method call, `obj.fn()`)
4. Default binding (plain function call, lowest priority)
5. Arrow functions ignore all of the above — always lexical

### Interview Answer Template (this)
> "`this` is determined by the call site, not where the function is defined — except for arrow functions, which inherit `this` lexically from their enclosing scope. The four binding rules in priority order are: `new` binding, explicit binding via call/apply/bind, implicit binding when called as a method, and default binding which falls back to the global object or undefined in strict mode. A classic real-world bug is losing `this` inside a regular function callback — like `setInterval` inside a method — which arrow functions fix because they don't rebind `this` themselves."