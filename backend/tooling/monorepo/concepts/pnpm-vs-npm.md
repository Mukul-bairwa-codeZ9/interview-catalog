# npm vs pnpm

## The Core Difference

Both are package managers that read `package.json` and install dependencies. They differ in **how dependencies are stored on disk and linked into your project** — and that one difference cascades into speed, disk usage, and correctness.

| Aspect | npm | pnpm |
|---|---|---|
| Storage model | Copies full package contents into every project's `node_modules` | One physical copy per package version in a global **content-addressable store**; projects get hard links |
| node_modules structure | Flat & hoisted (npm "flattens" the dependency tree to the top level) | Strict, nested via symlinks — mirrors the real dependency graph |
| Disk usage | High — same package duplicated across every project on your machine | Low — shared store means one `lodash@4.17.21` total, system-wide |
| Install speed | Slower, especially on large repos / CI (lots of copying) | Faster — linking is near-instant, no copying |
| Phantom dependencies | Possible — hoisting lets you `import` a package you never declared | Prevented — strict resolution only allows declared dependencies |
| Monorepo support | npm workspaces (added later, fewer features) | Built-in from the start, more mature `--filter` system |
| Lockfile | `package-lock.json` | `pnpm-lock.yaml` |
| Disk space at scale (e.g. 20 microservices) | Can balloon to GBs of duplicated `node_modules` | Stays small — store is shared across all 20 |

---

## Why It Happens: npm's Hoisting Problem

When npm installs dependencies, it tries to flatten the tree to avoid deep nesting. Example:

- Your project depends on `A`, and `A` depends on `lodash`.
- npm hoists `lodash` up to your **top-level** `node_modules`, not just inside `A`'s folder.

This means your own code can now do `require('lodash')` and it'll work — **even though you never added `lodash` to your `package.json`**. This is a phantom dependency: it works today, but breaks the moment `A` stops using `lodash` internally (your import silently breaks with no warning, because npm never told you that you were relying on someone else's dependency).

pnpm avoids this entirely. Its `node_modules` is structured so each package only "sees" what it explicitly listed. If your code tries to `require('lodash')` without declaring it, **it fails immediately** — which is a feature, not a bug. It surfaces the bug at install/dev time instead of at a random point in the future.

---

## Why pnpm Is Faster and Smaller (Mechanically)

1. First install of `lodash@4.17.21` anywhere on your machine → stored once in `~/.pnpm-store`, content-addressed by hash.
2. Every other project that needs `lodash@4.17.21` → pnpm creates a **hard link** (same file on disk, different name in different folders) instead of copying bytes.
3. Result: 50 projects using the same dependency version cost roughly the same disk space as **1** project using it.
4. Install speed improves because "linking a file" is a near-instant filesystem operation, while "copying a file" involves actually duplicating bytes — multiplied across thousands of files in `node_modules`.

---

## Interview Answer Template

> "The fundamental difference is dependency storage. npm copies every package into every project's `node_modules` and hoists dependencies to a flat structure, which is fast to reason about but causes disk bloat and phantom dependencies — code can accidentally rely on a package it never declared. pnpm instead keeps one physical copy of each package version in a global store and links it into projects using hard links and symlinks, with a strict, non-flat structure. That gives you faster installs, much lower disk usage, and it catches phantom dependency bugs immediately because undeclared imports simply fail."

---

## Common Follow-Up Questions

**Q: If pnpm is strictly better, why does anyone still use npm?**
> npm ships by default with Node.js, so it has zero setup cost and the widest tooling/CI compatibility. Some older tooling or CI pipelines assume `package-lock.json` specifically. Team familiarity and "it just works" inertia matter too — pnpm's advantages mostly show up at scale (large monorepos, many services), and a small single-app project may not feel the difference.

**Q: Does pnpm work with existing npm scripts and CI pipelines?**
> Yes — `package.json` `scripts` are identical. You generally just swap `npm install` → `pnpm install` and `npm run X` → `pnpm run X` (or `pnpm X`). The lockfile format changes (`pnpm-lock.yaml`), so that needs to be committed instead of `package-lock.json`.

**Q: How does pnpm handle a security/version mismatch — could a hard link mean one project accidentally affects another?**
> No. Hard links point to the same immutable, content-addressed file — `lodash@4.17.21` is always exactly that content, never mutated in place. If one project needs a patched `lodash@4.17.22`, that's a different hash and a separate entry in the store, so there's no risk of cross-project interference.

---

## Similar/Related Concepts
- Yarn (classic vs Berry/PnP) — Berry skips `node_modules` entirely via Plug'n'Play resolution
- `npm-shrinkwrap.json` / lockfile determinism in general
- Content-addressable storage (same concept used by Git internally, and by Docker layers)