# JWT Security Vulnerabilities

**Difficulty:** 🟡 Medium  
**Asked by:** Google, Netflix, security-focused startups, Auth0, Cloudflare, any senior backend role

---

## Q1: What is the "alg:none" attack?

**Plain Answer:**  
An attacker modifies the JWT header to set `"alg": "none"`, then strips the signature. Some libraries, if misconfigured, accept this as valid because they skip signature verification when the algorithm is `none`.

**Attack Flow:**
```
Original:  eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxIn0.SIGNATURE
Modified:  eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOiIxIiwicm9sZSI6ImFkbWluIn0.
           ↑ alg: none                ↑ tampered payload (role = admin)   ↑ empty signature
```

**How to prevent:**
- Always explicitly specify which algorithms are allowed
- Never accept `none` as a valid algorithm
- Use a well-maintained JWT library that is secure by default

```js
// ✅ Correct — explicitly whitelist algorithms
jwt.verify(token, secret, { algorithms: ['HS256'] });

// ❌ Dangerous — allows any algorithm including none
jwt.verify(token, secret);
```

**Interview Template Answer:**  
> "The `alg:none` attack exploits JWT libraries that trust the algorithm specified in the token header. An attacker takes a valid token, decodes it, changes the `alg` field to `none`, modifies the payload — say, escalating their role to admin — and removes the signature. Vulnerable libraries accept this because they see `alg: none` and skip verification. The fix is simple but critical: always explicitly whitelist the allowed algorithms when verifying, and reject `none` outright. This was a real vulnerability found in several popular JWT libraries around 2015. Any library worth using today should have this fixed, but you still need to configure it correctly."

---

## Q2: What is the algorithm confusion attack (RS256 → HS256)?

**Plain Answer:**  
If a server uses RS256, the public key is openly available. An attacker switches the algorithm in the JWT header from RS256 to HS256, then signs the token using the **public key as the HMAC secret**. A vulnerable server using the public key as both RS256 verify key and HS256 secret will accept this forged token.

**Flow:**
```
Server signs with:     RS256 + private key
Attacker sees:         Public key (freely available)
Attacker forges:       HS256 + public key as secret
Vulnerable server:     Verifies HS256 with public key → passes ✓ (wrongly!)
```

**How to prevent:**
- Always enforce a specific algorithm — never use the `alg` from the token header to determine verification method
- Use `{ algorithms: ['RS256'] }` explicitly — never `['RS256', 'HS256']` together

**Interview Template Answer:**  
> "This is a subtle but serious attack. When using RS256, the public key is shared openly. An attacker downloads the public key, modifies the JWT header to say `HS256`, then signs a forged payload using the public key as the HMAC secret. A vulnerable server that dynamically picks the verification algorithm based on the token's `alg` field will verify this as HS256 using the public key — and it'll pass. The defence is to never let the incoming token dictate which algorithm to use. Hardcode the expected algorithm on the server side and reject tokens with any other algorithm."

---

## Q3: What is JWT payload tampering?

**Plain Answer:**  
Since the payload is just Base64URL-encoded (not encrypted), an attacker might assume they can modify it. However, any change to the payload invalidates the signature — so tampering is detectable **only if** you verify the signature. If you skip verification, tampering succeeds.

**The risk:** Developers sometimes decode and use the JWT payload without calling `.verify()`.

```js
// ❌ NEVER do this — no signature verification!
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
const userId = payload.userId; // attacker controls this!

// ✅ Always verify first
const payload = jwt.verify(token, secret); // throws if tampered
const userId = payload.userId;
```

**Interview Template Answer:**  
> "JWT payload tampering is caught automatically by signature verification — that's the whole point. But the vulnerability arises when developers skip verification and directly decode the payload. I've seen this in production code where someone decoded the JWT to get the user ID without verifying the signature, effectively trusting attacker-controlled data. Always use the library's `verify` method, never just `decode`. Another angle: since payload is Base64-encoded and not encrypted, sensitive data in the payload — like passwords, SSNs, or PII — can be read by anyone who intercepts the token. Keep payloads minimal."

---

## Q4: What are weak secret key vulnerabilities?

**Plain Answer:**  
If the HMAC secret for HS256 is short or guessable (like `"secret"` or `"password"`), attackers can brute-force it offline using tools like **hashcat** with a JWT wordlist. Once they have the secret, they can forge any token.

**How to prevent:**
- Use a cryptographically random secret of at least 256 bits (32 bytes)
- Store secrets in environment variables / secrets manager, never in code
- Rotate secrets periodically

```js
// ❌ Weak secrets
const secret = 'secret';
const secret = 'mysupersecretkey';

// ✅ Strong secret generation
const secret = require('crypto').randomBytes(32).toString('hex');
```

**Interview Template Answer:**  
> "HS256 is only as strong as its secret. Attackers who get a valid JWT can attempt offline brute-force attacks against the HMAC secret using tools like hashcat — if the secret is short or dictionary-based, it can be cracked quickly. Once cracked, the attacker can forge tokens for any user, including admins. The fix: use a cryptographically random secret of at least 256 bits, generate it on first deploy, store it in a secrets manager like AWS Secrets Manager or HashiCorp Vault, and never commit it to source code. This is also why RS256 is preferable for high-security systems — the private key is much harder to brute-force."

---

## Q5: What is JWT expiration abuse and how do you handle it?

**Plain Answer:**  
- **No expiration**: Token is valid forever — a stolen token gives permanent access
- **Very long expiration**: Token stolen today is valid for months
- **Not checking `exp`**: Some libraries need you to explicitly check expiry

**Best practices:**
- Access tokens: short expiry (15 min – 1 hour)
- Refresh tokens: longer expiry (7–30 days), stored securely
- Always validate `exp` on every request
- Implement token rotation on refresh

**Interview Template Answer:**  
> "JWT expiration is critical. A token without an `exp` claim is valid indefinitely — if stolen, it provides permanent access with no way to revoke it short of rotating your signing secret. Even with expiry, tokens with 30-day lifetimes give attackers a long window. Best practice is short-lived access tokens — 15 minutes to an hour — paired with refresh tokens for seamless reauthentication. On the server, always validate the `exp` claim explicitly. Some libraries don't enforce this by default. For high-security apps, also implement a refresh token rotation strategy where each use of a refresh token issues a new one and invalidates the old."

---

## Security Vulnerability Quick Reference

| Vulnerability | Attack | Defence |
|---|---|---|
| `alg:none` | Strip signature, set alg to none | Whitelist algorithms explicitly |
| Algorithm confusion | Sign with public key using HS256 | Hardcode algorithm server-side |
| Weak secret | Brute-force HMAC secret | Use 256-bit random secret |
| Payload tampering | Modify payload without verifying sig | Always use `.verify()`, never `.decode()` |
| No expiration | Stolen token valid forever | Always set `exp`, use short lifetimes |
| Sensitive data in payload | Base64-decode to read PII | Never store sensitive data in JWT |