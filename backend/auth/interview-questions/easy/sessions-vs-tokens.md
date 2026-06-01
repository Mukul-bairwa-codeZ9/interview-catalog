# Sessions vs Tokens

**Difficulty:** 🟢 Easy  
**Asked by:** Stripe, Shopify, Atlassian, any startup, system design rounds

---

## Q1: What is session-based authentication?

**Plain Answer:**  
The server creates a **session** after login and stores it in memory or a database. It gives the client a **session ID** (usually in a cookie). On every request, the server looks up that session ID to identify the user.

**Analogy:**  
Like a coat check at a restaurant. You hand over your coat, get a **ticket number**. Every time you need something, you show the ticket and the staff looks up your coat. The restaurant (server) holds all the data.

**Interview Template Answer:**  
> "In session-based auth, after the user logs in, the server creates a session object containing user info and stores it server-side — in memory, Redis, or a database. The server sends back a session ID via a `Set-Cookie` header. On subsequent requests, the browser automatically sends this cookie, and the server looks up the session to authenticate the user. The key characteristic is that the server is **stateful** — it must maintain and look up session data for every request."

---

## Q2: What is token-based authentication?

**Plain Answer:**  
After login, the server creates a **signed token** (like a JWT) and sends it to the client. The client stores it (localStorage or cookie) and sends it with every request. The server **verifies the token signature** — no database lookup needed.

**Analogy:**  
Like a **passport**. The government (server) issues it once. Everywhere you travel, border control verifies it by checking the signature — they don't call the government each time. All the info is in the passport itself.

**Interview Template Answer:**  
> "Token-based auth is stateless. After login, the server issues a signed JWT and sends it to the client. The client stores it and includes it in the `Authorization: Bearer <token>` header on every request. The server verifies the token's signature using a secret or public key — no session store lookup is needed. This makes token-based auth horizontally scalable because any server instance can verify any token independently."

---

## Q3: What are the key differences between sessions and tokens?

| Aspect | Sessions | Tokens (JWT) |
|---|---|---|
| **State** | Stateful (server stores data) | Stateless (client stores data) |
| **Storage** | Server-side (memory/Redis/DB) | Client-side (cookie/localStorage) |
| **Scalability** | Harder — needs shared session store | Easy — any server can verify |
| **Revocation** | Easy — delete the session | Hard — token valid until expiry |
| **Payload** | Only session ID sent | Full claims sent in token |
| **Security** | CSRF risk (cookies) | XSS risk (if localStorage) |

**Interview Template Answer:**  
> "The core difference is **statefulness**. Sessions are server-side state — the server must store and look up session data, which means all servers need access to a shared session store like Redis when scaling horizontally. Tokens are self-contained — the server encodes user data into a signed token, and verification is just a cryptographic check with no DB call. However, sessions win on revocation: invalidating a session is instant (just delete it), whereas JWTs remain valid until expiry unless you implement a token blocklist, which reintroduces statefulness."

---

## Q4: When would you choose sessions over tokens, and vice versa?

**Plain Answer:**  
- Use **sessions** for: traditional web apps, when you need instant revocation (banking, healthcare)
- Use **tokens (JWT)** for: APIs, microservices, mobile apps, SPAs, cross-domain auth

**Interview Template Answer:**  
> "I'd choose sessions for traditional server-rendered apps where the backend has a single origin and instant logout capability is critical — like a banking dashboard. Sessions stored in HttpOnly cookies also have better XSS protection than JWTs in localStorage. I'd choose JWTs for RESTful APIs consumed by mobile apps or SPAs, microservices where each service needs to independently verify identity without calling a central auth server, and cross-domain scenarios like third-party API access. The trade-off is always **revocation ease vs scalability**."

---

## Q5: Where should you store a JWT on the client?

**Plain Answer:**  
- **HttpOnly Cookie** → Safe from XSS, but vulnerable to CSRF (use CSRF tokens to mitigate)
- **localStorage** → Vulnerable to XSS, but no CSRF risk
- **Recommendation**: HttpOnly Cookie with CSRF protection is the safer choice for web apps

**Interview Template Answer:**  
> "The two common options are localStorage and HttpOnly cookies, and each has trade-offs. localStorage is accessible via JavaScript, making it vulnerable to XSS attacks — if an attacker injects a script, they can steal the token. HttpOnly cookies can't be read by JavaScript at all, which eliminates XSS theft, but they're automatically sent with requests, making them vulnerable to CSRF attacks. The best practice is HttpOnly cookies combined with CSRF tokens or the `SameSite=Strict` cookie attribute. For maximum security, especially in high-stakes apps, I'd choose cookies over localStorage."

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| What is CSRF? | Cross-Site Request Forgery — tricking a user's browser into making unintended requests using their session cookie |
| What is XSS? | Cross-Site Scripting — injecting malicious scripts that can steal tokens from localStorage |
| Can you use both? | Yes — some apps use sessions for web and JWTs for mobile/API clients |
| What is a sliding session? | Session expiry resets on activity — keeps active users logged in |