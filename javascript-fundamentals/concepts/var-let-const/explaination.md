# var vs let vs const

## Overview
All three declare variables, but differ in **scope**, **hoisting behavior**, and **mutability rules**. This is one of the most-asked JS fundamentals topics because it reveals whether you understand execution context and scope chains, not just syntax.

## Comparison Table

| Feature | `var` | `let` | `const` |
|---|---|---|---|
| Scope | Function-scoped | Block-scoped | Block-scoped |
| Hoisting | Hoisted + initialized as `undefined` | Hoisted but in Temporal Dead Zone (TDZ) | Hoisted but in TDZ |
| Re-declaration | Allowed | Not allowed (same scope) | Not allowed |
| Re-assignment | Allowed | Allowed | Not allowed |
| Attached to global object (`window`) | Yes | No | No |

## Interview Traps

### Trap 1: var in loop + setTimeout (THE classic question)
```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
// Output: 3, 3, 3 — NOT 0, 1, 2

for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
// Output: 0, 1, 2 — correct
```
**Why it happens:** `var` is function-scoped, so there is only **one** `i` shared across all loop iterations. By the time the `setTimeout` callbacks actually run (100ms later, after the loop has already finished), `i` has already reached `3`. All three closures reference the *same* variable in memory.

`let` is block-scoped, and critically, the JS engine creates a **new binding of `i` for every single iteration** of the loop. Each `setTimeout` closure captures its own separate `i`, frozen at the value it had during that iteration.

**How to fix with `var` (pre-ES6 trick, good to know for interviews):**
```js
for (var i = 0; i < 3; i++) {
  (function (j) {
    setTimeout(() => console.log(j), 100);
  })(i); // IIFE creates a new scope per iteration, manually
}
```
**If asked "why does this matter in real code":** This bug commonly appears in loops that attach event listeners or async callbacks — e.g., rendering a list of buttons where each should log its own index.

---

### Trap 2: Temporal Dead Zone (TDZ)
```js
console.log(x); // ReferenceError: Cannot access 'x' before initialization
let x = 5;

console.log(y); // undefined (no error)
var y = 5;
```
**Why it happens:** All declarations (`var`, `let`, `const`, function declarations) are hoisted to the top of their scope during the "creation phase" of the execution context — but they're hoisted differently:
- `var` is hoisted **and initialized** to `undefined` immediately.
- `let`/`const` are hoisted but **left uninitialized** — they exist in a "Temporal Dead Zone" from the start of the scope until the line where they're actually declared. Accessing them in that zone throws a `ReferenceError`.

**Why TDZ exists (design reasoning):** It catches a real class of bugs — using a variable before its declaration line was always confusing/unsafe with `var` because you'd silently get `undefined` instead of an error. TDZ forces you to declare before use, which is safer.

**How to handle in code:** Always declare variables at the top of the block they're used in — this is just good practice anyway, but TDZ makes the engine enforce it for you.

---

### Trap 3: const doesn't mean immutable
```js
const arr = [1, 2, 3];
arr.push(4);     // ✅ works fine
console.log(arr); // [1, 2, 3, 4]

arr = [5, 6];     // ❌ TypeError: Assignment to constant variable
```
**Why it happens:** `const` only locks the **binding** (the variable name pointing to a specific memory address) — it does not freeze the **contents** of what that address holds. For objects/arrays, the address itself never changes when you mutate properties/elements, so it's allowed. Reassigning the variable to point to a *new* address is what's blocked.

**How to get true immutability:**
```js
const frozen = Object.freeze({ a: 1 });
frozen.a = 2;       // fails silently (or throws in strict mode)
console.log(frozen.a); // still 1

// Note: Object.freeze is SHALLOW — nested objects are still mutable
const nested = Object.freeze({ inner: { a: 1 } });
nested.inner.a = 99; // this WORKS — freeze didn't reach the nested object
```
**If asked about deep freeze:** Mention you'd need a recursive freeze function or a library like `deep-freeze`, since `Object.freeze` only protects the top level.

---

### Trap 4: var leaks out of blocks, let/const don't
```js
function test() {
  if (true) {
    var x = 10;
  }
  console.log(x); // 10 — leaked out of the if block

  if (true) {
    let y = 10;
  }
  console.log(y); // ReferenceError — y is block-scoped, doesn't exist here
}
```
**Why it happens:** `var` only respects **function boundaries**, not block boundaries (`if`, `for`, `while`, even bare `{}`). `let`/`const` respect block boundaries strictly, which matches how most other languages (Java, C++, Python) scope variables — making behavior more predictable.

---

### Trap 5: Re-declaration behavior
```js
var a = 1;
var a = 2; // ✅ fine, no error

let b = 1;
let b = 2; // ❌ SyntaxError: Identifier 'b' has already been declared
```
**Why it matters:** Allowing re-declaration with `var` was a historic source of bugs in large scripts — accidentally reusing a variable name in a different part of a function would silently overwrite it. `let`/`const` throwing an error here catches this class of bug at parse time, before code even runs.

## Interview Answer Template
> "`var` is function-scoped and hoisted with a default value of `undefined`, which causes issues like variable leakage out of blocks and the classic loop-closure bug with `setTimeout`. `let` and `const` are block-scoped and sit in the Temporal Dead Zone until their declaration line, which prevents use-before-declaration bugs. `const` locks the variable binding, not the value — so objects and arrays declared with `const` are still mutable. In practice, I default to `const`, use `let` only when reassignment is needed, and avoid `var` entirely."