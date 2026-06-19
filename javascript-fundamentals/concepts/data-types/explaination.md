# Data Types in JavaScript

## Overview
JavaScript has **8 data types**: 7 primitives + 1 non-primitive (object).

**Primitives:** `string`, `number`, `boolean`, `null`, `undefined`, `symbol`, `bigint`
**Non-primitive:** `object` (arrays, functions, dates, etc. are all objects)

## Why this matters in interviews
Interviewers use this topic to test whether you understand **memory model** (stack vs heap), not just syntax. The real signal they're looking for: do you know *why* primitives behave differently from objects?

## Pass by Value vs Pass by Reference

```js
// Primitives — stored by value (stack)
let a = 10;
let b = a;
b = 20;
console.log(a); // 10, untouched

// Objects — stored by reference (heap)
let obj1 = { val: 10 };
let obj2 = obj1;
obj2.val = 20;
console.log(obj1.val); // 20, same memory reference
```

## Interview Traps

### Trap 1: `typeof null === "object"`
```js
typeof null; // "object"
```
**Why it happens:** In the original 1995 JS engine, every value was stored as a 32-bit unit: a type tag (1–3 bits) + the actual value. Objects had a type tag of `000`. `null` was represented as the all-zero pointer `0x00`, which happened to also have the `000` type tag — so `typeof` reads it as `"object"`. It's a low-level encoding accident, not a design decision.

**How to handle it in code:**
```js
function isNull(val) {
  return val === null; // never rely on typeof for null checks
}
```
**If the interviewer pushes further:** "Why wasn't it fixed?" → Fixing it would break millions of existing websites checking `typeof x === "object"`, so TC39 (the JS standards committee) chose to preserve backward compatibility over correctness.

---

### Trap 2: NaN is not equal to itself
```js
NaN === NaN;        // false
typeof NaN;          // "number"
Number.isNaN(NaN);   // true — correct way to check
isNaN("hello");       // true — global isNaN coerces first, unreliable
Number.isNaN("hello"); // false — doesn't coerce, safer
```
**Why it happens:** NaN follows the IEEE 754 floating-point standard, which defines NaN as "not comparable to anything, including itself" — this is a floating-point spec rule used across nearly all programming languages, not a JS-specific quirk. It exists so that any operation involving NaN (e.g. `0/0`, `parseInt("abc")`) propagates as "invalid" rather than silently being treated as equal to other invalid results.

**Why `Number.isNaN` over global `isNaN`:** Global `isNaN()` coerces its argument to a number first, so `isNaN("hello")` converts `"hello"` → `NaN` → returns `true`, which is misleading. `Number.isNaN()` does no coercion — it only returns `true` if the value is *actually* the NaN type.

**How to handle it in code:**
```js
const safeCheck = (val) => Number.isNaN(val); // always prefer this in interviews
```

---

### Trap 3: Wrapper objects vs primitives
```js
typeof "hello";              // "string"
typeof new String("hello");  // "object"
new String("a") === "a";     // false
```
**Why it happens:** `new String("hello")` explicitly constructs a `String` **object** that wraps a primitive, instead of returning a primitive itself. JS auto-boxes primitives temporarily (e.g. `"hello".length` works because JS briefly wraps the string in an object to access `.length`, then discards the wrapper) — but `new String()` keeps that wrapper around permanently, which causes `typeof` and `===` to behave unexpectedly.

**How to handle it in code:**
```js
// Always use literals, never constructors, for primitives
const str = "hello";   // ✅ primitive
const num = 5;          // ✅ primitive
// const str = new String("hello"); ❌ avoid — creates object
```
**If asked why this matters:** Wrapper objects break strict equality (`===`), break `JSON.stringify` in edge cases, and silently behave as truthy even when "empty" (`new Boolean(false)` is truthy!).

---

### Trap 4: typeof function and arrays
```js
typeof function(){};  // "function"
typeof [];            // "object" (arrays are objects!)
typeof {};             // "object"
```
**Why it happens:** Under the hood, functions and arrays are **both objects** with extra internal behavior — arrays have integer-indexed properties and a `length` property; functions have an internal `[[Call]]` method that makes them callable. `typeof` gives functions their own special-cased label (`"function"`) because callability is fundamental to how JS treats them, but arrays don't get the same special-casing — they're just objects, so `typeof` reports `"object"`.

**How to distinguish array vs plain object in code:**
```js
Array.isArray([]);          // true — correct way
Array.isArray({});          // false
[] instanceof Array;        // true — also works, but fails across iframes/realms
Object.prototype.toString.call([]); // "[object Array]" — most robust, works everywhere
```

## Interview Answer Template
> "JavaScript has 7 primitive types and one reference type, object. Primitives are immutable and copied by value, while objects are copied by reference, which explains why mutating a copied object affects the original but mutating a copied primitive doesn't. A classic gotcha I watch for is `typeof null` returning `'object'` — that's a legacy bug, not actual behavior of null being an object."