# JWT Signing & Verification

**Difficulty:** 🟡 Medium  
**Asked by:** Auth0, Okta, Cloudflare, Stripe, Netflix, any company with distributed systems

---

## Q1: What is the difference between HS256 and RS256?

**Plain Answer:**  
- **HS256** (HMAC-SHA256) → **Symmetric** — same secret key used to sign AND verify
- **RS256** (RSA-SHA256) → **Asymmetric** — private key signs, public key verifies

| Aspect | HS256 | RS256 |
|---|---|---|
| Key type | Single shared secret | Private key (sign) + Public key (verify) |
| Who can verify | Anyone with the secret | Anyone with the public key (safe to share) |
| Best for | Single server / monolith | Microservices / distributed systems |
| Risk | Secret leak = full compromise | Private key stays on auth server only |

**Analogy:**  
- **HS256** = A padlock where the same key locks and unlocks it. Anyone who has a copy of the key can both lock and unlock.
- **RS256** = A mailbox. Anyone can drop mail in (verify = read public key), but only you with the private key can open it to collect mail (sign).

**Interview Template Answer:**  
> "HS256 uses a symmetric algorithm — the same secret key is used to both sign and verify tokens. This works fine for a monolith where only one server needs to verify tokens, but it's a problem in microservices because every service that needs to verify tokens must have the secret, increasing the attack surface. RS256 is asymmetric — the auth server signs tokens with a private key that never leaves it, and all other services verify using the public key, which can be freely distributed. I'd use RS256 in any distributed system because it gives you cryptographic separation between signing and verification."

---

## Q2: Walk me through the full JWT signing flow

**Plain Answer:**  
1. User logs in → server validates credentials
2. Server constructs header + payload JSON objects
3. Base64URL-encodes both
4. Concatenates: `encodedHeader + "." + encodedPayload`
5. Signs this string with the secret/private key using the chosen algorithm
6. Appends the signature: `encodedHeader.encodedPayload.signature`
7. Returns the JWT to the client

**Code Example (Node.js):**
```js
const crypto = require('crypto');

const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ userId: '123', exp: Date.now() / 1000 + 3600 })).toString('base64url');

const signature = crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(`${header}.${payload}`)
  .digest('base64url');

const token = `${header}.${payload}.${signature}`;
```

**Interview Template Answer:**  
> "The signing flow starts after the user's credentials are validated. The server creates a header JSON with the algorithm and type, and a payload JSON with the relevant claims — user ID, roles, issued-at, and expiration. Both are Base64URL-encoded and concatenated with a dot. That string is then signed using the chosen algorithm — for HS256, we compute an HMAC-SHA256 hash using the secret key; for RS256, we use RSA with SHA256 and the private key. The resulting signature is Base64URL-encoded and appended as the third segment. The full token is then sent to the client."

---

## Q3: What happens during JWT verification on the server?

**Plain Answer:**  
1. Extract token from `Authorization: Bearer <token>` header
2. Split by `.` → get header, payload, signature
3. Recompute signature from header + payload using same secret/public key
4. Compare signatures (constant-time comparison to prevent timing attacks)
5. Decode payload and validate: `exp` not passed, `iss` matches, `aud` matches
6. If all pass → extract user data and proceed

**Interview Template Answer:**  
> "Verification is the reverse of signing. The server splits the token on dots, takes the header and payload, and recomputes the expected signature using the same secret or the corresponding public key. It then compares the computed signature to the one in the token using a constant-time comparison function — this is important to prevent timing attacks where an attacker could infer the secret by measuring response time differences. If signatures match, the server decodes the payload and validates claims: checking the `exp` hasn't passed, the `iss` matches the auth server, and the `aud` matches the current service. Only then does it trust the token's claims."

---

## Q4: What is JWKS (JSON Web Key Set) and why is it used?

**Plain Answer:**  
JWKS is a public endpoint (usually `/.well-known/jwks.json`) that exposes the public keys used to verify JWTs. Services fetch this to get the right public key without needing manual key distribution.

**Why it matters:** When using RS256 in microservices, instead of hardcoding public keys in every service, they can dynamically fetch and cache keys from the JWKS endpoint.

**Interview Template Answer:**  
> "JWKS stands for JSON Web Key Set. It's a standardized format for exposing a server's public keys at a well-known URL. When an auth server uses RS256, microservices need its public key to verify tokens. Instead of manually distributing and hardcoding the public key in every service — which becomes a maintenance nightmare — each service fetches the JWKS endpoint, finds the key matching the `kid` (key ID) in the JWT header, and caches it. This also enables seamless key rotation: the auth server can publish new keys to JWKS and old tokens gradually expire, all without any service restarts. It's the standard approach used by Auth0, Google, and AWS Cognito."

---

## Q5: What is key rotation and why does it matter?

**Plain Answer:**  
Key rotation = periodically replacing the signing key with a new one. This limits damage if a key is compromised, since old tokens signed with the old key become invalid after rotation.

**Best practice:**
- Use `kid` (key ID) in JWT header to identify which key was used
- Publish multiple keys in JWKS during transition (old + new)
- Old tokens expire naturally; new tokens use the new key

**Interview Template Answer:**  
> "Key rotation is the practice of periodically replacing signing keys to limit the blast radius of a key compromise. If a private key is leaked, only tokens signed with that key are at risk — and if you rotate regularly, that window is small. The `kid` field in the JWT header allows the verifying service to look up the correct key from JWKS. During a rotation, you publish both the old and new key in the JWKS endpoint — old tokens are still verifiable and will expire naturally, while new tokens are signed with the new key. Once all old tokens expire, you remove the old key from JWKS. This is zero-downtime key rotation."

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| What is `kid` in JWT header? | Key ID — tells verifier which key to use from the JWKS endpoint |
| Why use constant-time comparison? | To prevent timing attacks where response time reveals how close a guess was to the secret |
| Can RS256 tokens be verified offline? | Yes — you only need the public key, which is safe to embed |
| What's ES256? | ECDSA with SHA-256 — similar to RS256 but smaller keys, faster operations |