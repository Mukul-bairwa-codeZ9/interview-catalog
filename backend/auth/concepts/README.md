# Authentication & JWT

A structured, interview-focused deep dive into Authentication, JWT, and OAuth 2.0.

---

## 🗂️ Structure

```
auth/
├── concepts/
│   ├── what-is-auth/         → Authentication vs Authorization
│   ├── session-vs-token/     → Session-based vs Token-based auth
│   ├── jwt-deep-dive/        → JWT internals, signing, verification
│   └── oauth-basics/         → OAuth 2.0 roles and flows
├── implementations/
│   └── auth(express)/        → Express.js middleware implementations
├── interview-questions/
│   ├── easy/
│   ├── medium/
│   └── advanced/
└── resources/
```

---

## 📚 Learning Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Concepts + SVG Visuals | ✅ Complete |
| 2 | Interview Q&A | 🔜 Next |
| 3 | Code Implementations | 🔜 Upcoming |

---

## 🧠 Key Concepts Covered

- **Authentication vs Authorization** — the #1 interview confusion
- **Session vs Token Auth** — trade-offs, when to use what
- **JWT Deep Dive** — structure, signing algorithms, attack vectors
- **OAuth 2.0** — roles, grant types, Authorization Code flow

---

## 🎯 Interview Readiness Goals

After completing all phases you should be able to:

- Explain how JWT works without looking at notes
- Compare sessions vs tokens with real trade-offs
- Identify JWT security vulnerabilities (alg:none, weak secrets, etc.)
- Walk through an OAuth 2.0 Authorization Code flow step by step
- Implement JWT auth middleware in Express.js from scratch