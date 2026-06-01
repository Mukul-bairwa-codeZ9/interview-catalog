# JWT Deep Dive

## What is a JWT?

**JSON Web Token** — a compact, self-contained token that carries verified information (claims) about a user, signed by the server.

> Think of it as a tamper-proof ID card. Anyone can read it, but only the issuer can create one that passes the signature check.

---

## The 3-Part Structure

A JWT looks like this:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiTXVrdWwiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3MDAwMDAwMDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Three parts separated by dots: `HEADER.PAYLOAD.SIGNATURE`

---

### Part 1: Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

- `alg` — signing algorithm (`HS256`, `RS256`, `ES256`)
- `typ` — always "JWT"
- Base64URL encoded (not encrypted, anyone can decode it)

---

### Part 2: Payload (Claims)

```json
{
  "sub": "user_123",
  "name": "Mukul",
  "role": "admin",
  "iat": 1700000000,
  "exp": 1700003600
}
```

**Standard claims:**
| Claim | Meaning |
|-------|---------|
| `sub` | Subject — who the token is about (user ID) |
| `iss` | Issuer — who created the token |
| `exp` | Expiry — Unix timestamp when token expires |
| `iat` | Issued At — when the token was created |
| `aud` | Audience — who the token is intended for |

- Also base64URL encoded — **not encrypted**
- ⚠️ Never put sensitive data (passwords, secrets) in the payload

---

### Part 3: Signature

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  SECRET_KEY
)
```

- Server signs the header+payload with a **secret key**
- Anyone with the secret can verify the token hasn't been tampered with
- Changing even one character in the payload **invalidates the signature**

---

## JWT Lifecycle

```
1. User logs in
        ↓
2. Server creates payload (sub, role, exp)
        ↓
3. Server signs it → produces JWT
        ↓
4. Client stores JWT (localStorage or httpOnly cookie)
        ↓
5. Client sends JWT in every request header:
   Authorization: Bearer <token>
        ↓
6. Server verifies signature → extracts claims → responds
        ↓
7. Token expires → client uses refresh token to get new JWT
```

---

## Signing Algorithms

| Algorithm | Type | How it works | Use when |
|-----------|------|-------------|----------|
| HS256 | Symmetric | Same secret signs + verifies | Single server, simple setup |
| RS256 | Asymmetric | Private key signs, public key verifies | Microservices, third-party verification |
| ES256 | Asymmetric | Elliptic Curve, smaller keys | Performance-sensitive systems |

**Interview tip:** RS256 is preferred in distributed systems because you can share the public key with any service to verify tokens — without ever exposing the private key.

---

## Access Token vs Refresh Token

| | Access Token | Refresh Token |
|--|---|---|
| Purpose | Authenticate requests | Get a new access token |
| Expiry | Short (15 min – 1 hour) | Long (7–30 days) |
| Sent with | Every API request | Only to /auth/refresh endpoint |
| Storage | Memory or httpOnly cookie | httpOnly cookie only |

---

## JWT Security Vulnerabilities (Must Know for Interviews)

### 1. `alg: none` Attack
Attacker changes header to `"alg": "none"` and removes signature. Some old libraries accepted this.
**Fix:** Always explicitly specify the allowed algorithm — never accept `none`.

### 2. Weak Secret Key
If `SECRET_KEY` is `"secret"` or `"password"`, attacker can brute-force it offline.
**Fix:** Use a long random secret (256-bit minimum). For production, use RS256.

### 3. Storing JWT in localStorage
JavaScript on the page can access it → XSS vulnerability.
**Fix:** Use `httpOnly` cookies for sensitive tokens.

### 4. Missing Expiry (`exp`)
Token lives forever if `exp` is not set.
**Fix:** Always set `exp`. Keep access tokens short-lived.

### 5. Not Validating `aud` or `iss`
Token issued for one service accepted by another.
**Fix:** Always validate `iss` and `aud` claims.

---

## Interview Answer Template

*"A JWT has three base64URL-encoded parts: the header (algorithm type), the payload (claims like user ID and expiry), and the signature. The signature is created by hashing the header and payload with a secret key, which means if anyone modifies the payload, the signature won't match and the token is rejected. The key thing is that JWTs are self-contained — the server doesn't need to look anything up, it just verifies the signature. The trade-off is that they can't be revoked before expiry, which is why access tokens should be short-lived, paired with longer-lived refresh tokens."*