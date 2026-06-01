# Session-Based vs Token-Based Authentication

---

## Session-Based Auth (Stateful)

The server **remembers** the user.

### How it works:
1. User logs in with credentials
2. Server creates a **session** in memory/database and returns a **Session ID**
3. Browser stores Session ID in a **cookie**
4. Every request sends the cookie → server looks up the session → identifies the user
5. On logout, server **destroys** the session

### Key property: The server holds the truth.

```
Client                         Server
  |                              |
  |  POST /login (user+pass)     |
  |----------------------------->|
  |                              | creates session in DB
  |  Set-Cookie: sessionId=abc   |
  |<-----------------------------|
  |                              |
  |  GET /profile                |
  |  Cookie: sessionId=abc       |
  |----------------------------->|
  |                              | looks up session "abc" in DB
  |  200 OK (user data)          |
  |<-----------------------------|
```

---

## Token-Based Auth (Stateless)

The server **does not remember** the user. The token itself carries all the information.

### How it works:
1. User logs in with credentials
2. Server creates a **signed token** (e.g., JWT) and returns it
3. Client stores the token (localStorage or cookie)
4. Every request sends the token in `Authorization` header
5. Server **verifies the signature** — no DB lookup needed
6. On logout, client discards the token (server has no session to destroy)

```
Client                         Server
  |                              |
  |  POST /login (user+pass)     |
  |----------------------------->|
  |                              | creates JWT, signs it
  |  { token: "eyJ..." }         |
  |<-----------------------------|
  |                              |
  |  GET /profile                |
  |  Authorization: Bearer eyJ.. |
  |----------------------------->|
  |                              | verifies signature (no DB)
  |  200 OK (user data)          |
  |<-----------------------------|
```

---

## Side-by-Side Comparison

| Property | Session-Based | Token-Based (JWT) |
|----------|--------------|-------------------|
| State | Stateful (server stores session) | Stateless (server stores nothing) |
| Storage (client) | Cookie (Session ID) | localStorage or Cookie |
| Storage (server) | DB / memory / Redis | Nothing |
| Scalability | Harder — needs shared session store across servers | Easy — any server can verify |
| Revocation | Easy — delete the session | Hard — token valid until expiry |
| Performance | DB lookup on every request | Cryptographic verify only |
| Best for | Traditional web apps, monoliths | APIs, microservices, mobile apps |

---

## The Revocation Problem (Critical Interview Topic)

**Sessions:** Logout = delete session from DB. Immediately invalid everywhere.

**JWT:** Logout = client deletes token. But the token is still valid on the server until it expires.

### Solutions for JWT revocation:
- Short expiry (15 min) + refresh tokens
- Token blacklist in Redis (but now you're stateful again)
- Rotating refresh tokens

---

## When to Use Which?

**Use Sessions when:**
- Traditional server-rendered web app
- You need instant revocation (banking, healthcare)
- Single server or sticky sessions are fine

**Use Tokens (JWT) when:**
- Building a REST API consumed by mobile/SPA
- Microservices (multiple servers need to verify)
- Third-party clients need to authenticate

---

## Interview Answer Template

*"Session-based auth is stateful — the server stores the session and the client just holds an ID. Token-based auth is stateless — the token itself contains all the information, signed so the server can verify it without any storage. The main trade-off is scalability vs revocability. JWT scales better across multiple servers, but revoking a token before expiry requires extra infrastructure like a blacklist."*