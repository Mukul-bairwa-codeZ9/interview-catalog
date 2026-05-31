# Call Stack — Concepts

> Plain-English explanations for the core concept. Read this alongside the SVG visuals.

---

## 1. Call Stack

JavaScript is **single-threaded** — it can only do one thing at a time.

The **call stack** is how JS tracks _where it is_ in your code.

### What is a Call Stack?

The **call stack** is a memory structure that stores information about active function calls during program execution. It's a **LIFO (Last In, First Out)** data structure — meaning the last function added is the first one to finish.

- Every time you call a function → a **frame** (stack frame) is **pushed** onto the stack
- When the function returns → the frame is **popped** off
- The function at the **top** of the stack is currently running
- When the stack is empty → all code has finished executing

### Stack Frame Contents

Each frame contains:
- Function parameters
- Local variables
- Return address (where to continue after the function ends)

```js
function main() { greet("Mukul"); }
function greet(name) { say("Hello " + name); }
function say(msg) { console.log(msg); }

main();
// Stack at peak: console.log → say → greet → main
```

### Visual Flow
📎 Visual: `call-stack/call-stack.svg`

main() called → [main]
greet() called → [main, greet]
say() called → [main, greet, say]
log() called → [main, greet, say, console.log]
log() returns→ [main, greet, say]
say() returns → [main, greet]
greet() returns → [main]
main() returns → 