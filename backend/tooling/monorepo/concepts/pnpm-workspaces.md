# pnpm Workspaces

## What It Is

A **workspace** is pnpm's way of managing multiple packages (apps, libraries, services) inside a single repository (a "monorepo"). The workspace is declared by one file at the repo root:

`pnpm-workspace.yaml`

```yaml
packages:
  - "backend/*"
  - "frontend"
  - "shared"
  - "docs"
```

Each glob/path listed here is treated as an independent package **if and only if** it contains its own `package.json`. pnpm scans these folders and links them together.

---

## Why It Exists (The Problem It Solves)

Without workspaces, every app/package in a multi-project repo would need:
- its own `node_modules`
- duplicate copies of every shared dependency (React, Express, lodash, etc.)
- manual `npm link` or `file:../shared` hacks to use code from a sibling package

This wastes disk space, slows installs, and makes versioning shared code painful.

Workspaces fix this by:
1. Installing dependencies **once**, in a central store
2. **Linking** (not copying) them into each package's `node_modules`
3. Letting packages depend on **each other** directly using `workspace:*` protocol instead of publishing to npm first

---

## How It Actually Works (The "Why It Happens" Part)

1. pnpm reads `pnpm-workspace.yaml` and discovers every package folder.
2. It builds a **dependency graph** across all of them (e.g., `backend/api` depends on `shared`).
3. All actual package code lives in a single **global content-addressable store** on your machine (usually `~/.pnpm-store`) — one physical copy of `lodash@4.17.21` no matter how many projects use it.
4. Each project's `node_modules` is populated with **hard links** to that store (instant, no copying) and a **symlinked, strict dependency tree** — meaning a package can only `require()`/`import` what it explicitly listed in its own `package.json`, even if a sibling package has it installed.
5. To reference another local package, you write in `package.json`:
   ```json
   {
     "dependencies": {
       "shared": "workspace:*"
     }
   }
   ```
   pnpm resolves `workspace:*` to a **symlink pointing directly at the local `shared` folder** — so changes to `shared` are reflected immediately in `backend/api`, no publish/install cycle needed.

---

## Key Commands You Should Know

| Command | What it does |
|---|---|
| `pnpm install` | Installs deps for **all** packages in the workspace at once |
| `pnpm --filter backend run dev` | Runs the `dev` script only in the `backend` package |
| `pnpm --filter "./backend/*" run test` | Runs `test` in every package under `backend/` |
| `pnpm add lodash --filter shared` | Adds `lodash` as a dependency of just the `shared` package |
| `pnpm add -w typescript` | Adds a dependency to the **root** (`-w` = workspace root), for tools shared by everything (e.g. TypeScript, ESLint) |

---

## Interview Answer Template (say this out loud)

> "`pnpm-workspace.yaml` is the file that turns a repo into a monorepo for pnpm — it lists which folders are independent packages. pnpm then builds a dependency graph across those packages, stores every dependency once in a global content-addressable store, and links it into each package via hard links and symlinks instead of copying it. This makes installs fast and disk-efficient, and it lets packages depend directly on each other using the `workspace:*` protocol, so local code changes are picked up immediately without publishing anything."

---

## Common Follow-Up Questions

**Q: What happens if two packages need different versions of the same dependency?**
> pnpm's store holds multiple versions side by side (content-addressed by version+hash), and each package's symlinked `node_modules` points to the version it actually declared. No conflict — each package gets exactly what it asked for.

**Q: What's a "phantom dependency" and how do workspaces relate to it?**
> A phantom dependency is when your code imports a package you never declared in `package.json`, but it works anyway because some other package hoisted it into a shared `node_modules`. pnpm's strict, symlinked structure prevents this — if you didn't declare it, you can't import it. This is true within workspaces too: a package can't accidentally import a sibling's dependency just because it's "nearby."

**Q: Can a workspace package be published to npm normally?**
> Yes — `workspace:*` is just a local-dev resolution. When you publish, pnpm rewrites `workspace:*` to the package's actual current version number in the published `package.json`.

---

## Similar/Related Concepts
- npm workspaces (same idea, different internals — see `npm-vs-pnpm.md`)
- Yarn workspaces (Yarn Berry / PnP — alternate linking strategy, no `node_modules` at all)
- Turborepo (`turborepo.md`) — orchestrates *tasks* across the packages this file defines