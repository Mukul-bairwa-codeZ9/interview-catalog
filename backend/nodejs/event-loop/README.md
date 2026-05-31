# Node.js Event Loop

> Part of the backend self-study repository. Phase 1 (concepts + visuals) complete.

---

## Why This Matters for Interviews

The event loop is asked in **almost every Node.js / backend interview**. Companies like Google, Meta, Uber, and startups all test it — either directly ("explain the event loop") or through output-order puzzles ("what does this code print?").

---

## Study Phases

| Phase | Status | Contents |
|---|---|---|
| Phase 1 | ✅ Complete | Concepts + animated SVG visuals |
| Phase 2 | 🔜 Next | Interview Q&A (easy → medium → advanced) |
| Phase 3 | 🔜 Pending | Code demos showing real event loop behavior |

---

## Concepts Covered (Phase 1)

| Concept | Visual | Plain-English |
|---|---|---|
| Call Stack | `concepts/call-stack/call-stack.svg` | How JS tracks function execution |
| Callback Queue | `concepts/callback-queue/callback-queue.svg` | How async callbacks wait their turn |
| Microtask Queue | `concepts/microtask-queue/microtask-queue.svg` | Why Promises run before setTimeout |
| Event Loop Phases | `concepts/event-loop-phases/event-loop-phases.svg` | The 6 libuv phases in Node.js |

---

## Quick Reference — Interview One-Liners

- **Call Stack:** LIFO structure; JS can only execute one function at a time
- **Callback Queue:** Async callbacks wait here; event loop picks them when stack is empty
- **Microtask Queue:** Promises go here; fully drained before any macro task
- **Poll Phase:** Where Node.js spends most time — blocks waiting for I/O
- **setImmediate vs setTimeout(fn,0):** Inside I/O callbacks, `setImmediate` always wins

---

## Folder Structure

```
event-loop/
  README.md                        ← you are here
  concepts/
    README.md                      ← plain-English explanations
    call-stack/
      call-stack.svg
    callback-queue/
      callback-queue.svg
    microtask-queue/
      microtask-queue.svg
    event-loop-phases/
      event-loop-phases.svg
  interview-questions/
    easy/
    medium/
    advanced/
  implementations/
    event-loop-demos/
```