# Type Coercion, Equality, and Truthy/Falsy

## Overview
These three concepts are tightly linked — coercion explains *why* `==` behaves unpredictably, and truthy/falsy rules explain *why* conditions behave the way they do. Interviewers love combining all three into rapid-fire "guess the output" questions.

---

## Part 1: Type Coercion

Coercion is JS automatically converting a value from one type to another.
- **Implicit coercion** — JS does it automatically (`"5" + 3`)
- **Explicit coercion** — you do it manually (`Number("5")`)

### The `+` operator is special
```js
"5" + 3;      // "53" — string concatenation wins
5 + "3";      // "53"
5 + 3;        // 8 — both numbers, normal addition
"5" + 3 + 2;  // "532" — left to right: "5"+3="53", then "53"+2="532"
5 + 3 + "2";  // "82" — 5+3=8 first (both numbers), then 8+"2"="82"
```
**Why:** `+` checks: if **either** operand is a string, it converts the other to a string and concatenates. Order of evaluation (left to right) determines the result when mixing types mid-expression.

### Other arithmetic operators force numbers
```js
"5" - 3;   // 2 — minus only works numerically, so "5" is converted to 5
"5" * "2"; // 10
"5" / "2"; // 2.5
"abc" - 1; // NaN — "abc" can't convert to a number
```
**Why:** `-`, `*`, `/` have no string-concatenation meaning, so JS always tries to convert both operands to numbers.

### Trap: Array and object coercion
```js
[] + [];        // "" — both arrays convert to empty strings, concatenated
[] + {};        // "[object Object]"
{} + [];        // 0 (in console/script context — parsed as empty block + unary +[])
[1,2] + [3,4]; // "1,23,4" — arrays convert to comma-joined strings
```
**Why:** Objects/arrays get converted via `toString()` (or `valueOf()` first if defined) when used with `+`. Arrays' default `toString()` joins elements with commas; empty array → `""`.

---

## Part 2: Equality — `==` vs `===`

### `===` (strict equality)
No coercion. Both type AND value must match.
```js
5 === "5";   // false — different types
5 === 5;     // true
null === undefined; // false — different types
```

### `==` (loose equality)
Coerces operands to the same type before comparing, following the **Abstract Equality Algorithm**.
```js
5 == "5";          // true — "5" coerced to 5
null == undefined;  // true — special-cased to be equal to each other ONLY
null == 0;          // false — null does NOT coerce to 0 in ==
0 == "";            // true — "" coerced to 0
0 == "0";           // true
"" == "0";          // false — neither side is a number, compared as strings, differ
false == "0";        // true — false→0, "0"→0
false == [];          // true — false→0, []→""→0
NaN == NaN;           // false — NaN is never equal to anything, even itself
```
**Why this matters:** `==` has special-cased rules (like `null == undefined` working but `null == 0` not working) that don't follow one simple pattern — that's exactly why interviewers ask these. The real-world takeaway: **always use `===`** to avoid relying on memorized edge cases. The one common exception teams allow: `value == null` as a shorthand to check for both `null` and `undefined` at once.

### Object/array equality is always by reference
```js
{} === {};            // false — different objects in memory
[] === [];             // false
const a = {};
const b = a;
a === b;               // true — same reference
```

---

## Part 3: Truthy / Falsy Values

JS converts any value to `true`/`false` when used in a boolean context (`if`, `&&`, `||`, `!!`).

### The 8 falsy values (memorize this list — interviewers expect it cold)
```js
false
0
-0
0n        // BigInt zero
""        // empty string
null
undefined
NaN
```

### Everything else is truthy — including these commonly-missed cases
```js
if ("0") console.log("truthy");   // runs! non-empty string
if ([]) console.log("truthy");     // runs! empty array is truthy
if ({}) console.log("truthy");     // runs! empty object is truthy
if ("false") console.log("truthy"); // runs! non-empty string, even though it reads "false"
```
**Why arrays/objects are always truthy:** Any object (including empty ones) is a reference, and references are never falsy — only the 8 specific primitive values above are falsy. Beginners often assume `[]` or `{}` is falsy because they're "empty," but emptiness doesn't matter — only the type/value pairing matters.

### Quick truthy check trick
```js
!!value // double negation converts any value to its boolean equivalent
!!"";    // false
!!"0";   // true
!![];    // true
```

---

## Interview Answer Template
> "JS coerces types implicitly depending on the operator — `+` favors string concatenation, while `-`, `*`, `/` always coerce to numbers. `==` uses the Abstract Equality Algorithm to coerce operands before comparing, which leads to inconsistent-feeling results like `null == undefined` being true but `null == 0` being false. I always use `===` to avoid relying on those edge cases, with the one exception of `value == null` as a shorthand for null-or-undefined checks. For truthy/falsy, I know the 8 falsy values cold — everything else, including empty arrays and objects, is truthy because they're references, not one of the falsy primitives."