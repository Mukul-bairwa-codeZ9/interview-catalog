# JWT Basics

**Difficulty:** 🟢 Easy  
**Asked by:** Practically every company — Google, Amazon, Meta, Uber, startups

---

## Q1: What is a JWT?

**Plain Answer:**  
JWT (JSON Web Token) is a compact, self-contained token that encodes user information and is cryptographically signed. It has 3 parts separated by dots: **Header.Payload.Signature**

**Analogy:**  
Think of a JWT like a **signed check**:
- The **header** says what type of check it is and how it's signed
- The **payload** is the amount and who it's made out to (your claims/data)
- The **signature** is the bank's stamp proving it's authentic and hasn't been altered

**Interview Template Answer:**  
> "A JWT is an open standard (RFC 7519) for securely transmitting information as a JSON object. It consists of three Base64URL-encoded parts separated by dots: the header, payload, and signature. The header specifies the token type and signing algorithm. The payload contains claims — statements about the user like their ID, roles, and expiry time. The signature is computed from the header + payload using a secret or private key, which allows any server with the correct key to verify the token hasn't been tampered with. JWTs are stateless — all information needed for verification is in the token itself."

---

## Q2: What are the three parts of a JWT?

**Plain Answer:**

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9    ← Header (Base64URL)
.
eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE2OTk5OTk5OTl9  ← Payload (Base64URL)
.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  ← Signature (HMAC/RSA)
```

**Header** — algorithm and token type:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload** — claims (user data):
```json
{
  "userId": "123",
  "role": "admin",
  "iat": 1699999000,
  "exp": 1699999999
}
```

**Signature** — computed as:
```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

**Interview Template Answer:**  
> "A JWT has three parts. The **header** is a Base64URL-encoded JSON object containing the algorithm used for signing, like HS256 or RS256. The **payload** contains claims — standard ones like `iss` (issuer), `exp` (expiration), `sub` (subject/user ID), plus custom claims like `role`. The **signature** is created by taking the encoded header and payload, concatenating them with a dot, and signing with a secret key or private key. When the server receives a JWT, it recomputes the signature and compares it — if they match, the token is valid and untampered."

---

## Q3: What are JWT claims? What are the standard ones?

**Plain Answer:**  
Claims are key-value pairs in the payload. They carry information about the user and the token itself.

**Standard Claims (Registered Claims):**

| Claim | Meaning | Example |
|---|---|---|
| `iss` | Issuer — who created the token | `"auth.myapp.com"` |
| `sub` | Subject — who the token is about | `"user_123"` |
| `aud` | Audience — who should accept it | `"api.myapp.com"` |
| `exp` | Expiration time (Unix timestamp) | `1699999999` |
| `iat` | Issued at (Unix timestamp) | `1699996399` |
| `nbf` | Not before — token invalid until this time | `1699996399` |
| `jti` | JWT ID — unique token identifier | `"abc-123"` |

**Interview Template Answer:**  
> "JWT claims are the data fields inside the payload. There are three types: registered claims (standard, like `exp` for expiration and `sub` for subject), public claims (defined in IANA registry), and private claims (custom fields agreed upon between parties, like `role` or `userId`). In practice, I always include `exp` to ensure tokens expire, `iat` to know when it was issued, and `sub` to identify the user. I avoid storing sensitive data in the payload because it's only Base64-encoded, not encrypted — anyone can decode it."

---

## Q4: Is JWT payload secure? Can anyone read it?

**Plain Answer:**  
**No — JWT payload is NOT encrypted by default.** It's just Base64URL-encoded, which anyone can decode. The signature only proves it hasn't been *tampered with*, not that it's secret.

**Interview Template Answer:**  
> "This is a common misconception. A standard JWT (JWS — JSON Web Signature) is signed, not encrypted. The payload is Base64URL-encoded, which is trivially reversible — anyone who has the token can decode and read the payload. This means you should never store sensitive data like passwords, credit card numbers, or PII in a JWT payload. If you need an encrypted token, you'd use JWE (JSON Web Encryption). For most use cases, storing a user ID and role in the payload is fine since that's not sensitive."

---

## Q5: How does JWT verification work?

**Plain Answer:**  
1. Server receives the token
2. Splits into header, payload, signature
3. Recomputes the signature using the same algorithm + secret key
4. Compares recomputed signature with the received signature
5. Also checks `exp`, `iss`, `aud` claims
6. If everything matches → token is valid

**Interview Template Answer:**  
> "When a server receives a JWT, it first splits the token by the dots to get the header, payload, and signature. It then recomputes the signature by Base64URL-encoding the header and payload, joining them with a dot, and applying the signing algorithm with the secret or public key. If the recomputed signature matches the one in the token, the data hasn't been tampered with. The server also validates standard claims — checking that `exp` hasn't passed, `iss` matches the expected issuer, and `aud` matches the intended audience. Only after all checks pass is the user considered authenticated."

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| What is the max size of a JWT? | No hard limit, but keep it small — cookies have a 4KB limit and large tokens slow requests |
| Can you invalidate a JWT? | Not easily — that's the main downside; need a blocklist or short expiry |
| What's the difference between JWS and JWE? | JWS = signed (integrity), JWE = encrypted (confidentiality + integrity) |
| What algorithm should you use? | RS256 for distributed systems, HS256 for single-server; avoid `none` |