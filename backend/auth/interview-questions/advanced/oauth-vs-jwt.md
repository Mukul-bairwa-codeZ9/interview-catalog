# OAuth vs JWT — How They Relate

**Difficulty:** 🔴 Advanced  
**Asked by:** Senior backend roles, system design rounds, Google, Stripe, any SSO/platform team

---

## Q1: What is the difference between OAuth and JWT?

**Plain Answer:**  
They answer completely different questions and operate at different layers:

| | OAuth 2.0 | JWT |
|---|---|---|
| **What is it?** | An authorization *framework* | A token *format* |
| **Question it answers** | "How do I grant app X access to resource Y?" | "How do I encode and verify a claim securely?" |
| **Specifies** | Flows, endpoints, roles, scopes | Token structure, signing, claims |
| **Can be used without the other?** | Yes — OAuth can use opaque tokens | Yes — JWTs can be used outside OAuth |

**Analogy:**  
- **OAuth** is like the **postal system** — rules for how to send and receive mail, who can deliver, what routes exist
- **JWT** is like the **envelope format** — specifies how to seal it, address it, and verify it wasn't tampered with
- You can use the postal system with different envelope formats, and you can use the JWT envelope format for things other than mail

**Interview Template Answer:**  
> "OAuth and JWT are frequently confused because they're often used together, but they operate at completely different levels. OAuth 2.0 is a framework — it defines how authorization works: the roles (client, resource server, auth server), the flows (authorization code, client credentials), the endpoints, and the concept of scopes. It says nothing about what a token looks like. JWT is a token format — it defines how to structure, sign, and verify a self-contained token. OAuth can use JWTs as the format for its access tokens, or it can use opaque tokens (random strings). JWTs can be used completely outside of OAuth — for example, for stateless session management in a simple web app. They solve different problems."

---

## Q2: How do OAuth and JWT work together?

**Plain Answer:**  
OAuth defines *that* an access token should be issued. JWT defines *what* that token looks like. When combined:

1. OAuth flow runs (e.g., Authorization Code)
2. Auth server issues an **access token formatted as a JWT**
3. Client sends JWT to resource server
4. Resource server verifies JWT **locally** (no auth server call needed)

Without JWT (opaque token):
```
Client → Resource Server: "Here's token abc123xyz"
Resource Server → Auth Server: "Is abc123xyz valid? What are its scopes?"  ← introspection call
Auth Server → Resource Server: "Yes, it's for user 123 with scope: read"
```

With JWT:
```
Client → Resource Server: "Here's this JWT"
Resource Server: verifies signature locally ✅  ← no auth server call
Resource Server: reads userId, scopes from payload ✅
```

**Interview Template Answer:**  
> "In practice, OAuth defines the authorization flow and JWT is often chosen as the token format because of its self-contained nature. When an OAuth authorization server issues a JWT access token, it signs it with its private key and encodes the user's identity, granted scopes, expiry, and issuer. The resource server can verify this token independently using the auth server's public key — typically fetched from a JWKS endpoint. This is far more efficient than opaque tokens, which require the resource server to call the auth server's introspection endpoint on every request. JWT access tokens enable stateless, distributed authorization at scale, which is why they're the standard choice in microservices architectures."

---

## Q3: What is OpenID Connect and how does it relate to OAuth and JWT?

**Plain Answer:**  
- **OAuth 2.0** = authorization (access to resources)
- **OpenID Connect (OIDC)** = authentication (identity) built on top of OAuth 2.0
- **JWT** = the format OIDC uses for its `id_token`

OIDC adds to OAuth 2.0:
- `id_token` (a JWT containing user identity)
- `/userinfo` endpoint
- Standard claims: `sub`, `email`, `name`, `picture`
- Discovery endpoint: `/.well-known/openid-configuration`

**The layering:**
```
┌─────────────────────────────────────┐
│         OpenID Connect              │  ← Authentication (who you are)
│  (id_token as JWT, userinfo, etc.)  │
├─────────────────────────────────────┤
│           OAuth 2.0                 │  ← Authorization (what you can do)
│  (flows, scopes, access tokens)     │
├─────────────────────────────────────┤
│              JWT                    │  ← Token format (how tokens look)
└─────────────────────────────────────┘
```

**Interview Template Answer:**  
> "OpenID Connect is an identity layer built on top of OAuth 2.0. While OAuth 2.0 only handles authorization — granting access to resources — it doesn't tell you *who* the user is. OIDC adds authentication by introducing the `id_token`, which is a JWT containing identity claims like the user's subject ID, email, and name. When a user logs in via 'Login with Google', Google runs an OAuth 2.0 Authorization Code flow, but because it also implements OIDC, it returns both an access token (for calling Google APIs) and an `id_token` (for knowing who the user is). The `id_token` is always a JWT. The access token format is up to the server — it could be a JWT or an opaque string."

---

## Q4: When would you use JWT without OAuth?

**Plain Answer:**  
JWTs are useful for stateless auth in any system — not just OAuth scenarios.

**Use JWT without OAuth when:**
- Building a simple web/mobile app with your own auth (login with email+password)
- Stateless session replacement — JWT replaces server-side session
- Service-to-service communication in a microservice (internal, no user delegation)
- Passwordless auth (magic links, email tokens)
- Email verification tokens, password reset tokens

**Example — simple app auth:**
```
User logs in with email/password
Your server validates → issues JWT
Client sends JWT with every request
Your server verifies JWT (no OAuth involved)
```

**Interview Template Answer:**  
> "JWT is a general-purpose signed token format and doesn't require OAuth. For a typical web or mobile app that manages its own user accounts with email/password auth, you'd issue a JWT after login without any OAuth flow — it's just your server creating and verifying its own tokens. JWTs are also useful for short-lived purpose-specific tokens: a password reset link can embed a JWT with a 15-minute expiry and a 'reset_password' claim; an email verification link can contain a JWT scoped to a specific email address. OAuth comes into play when you need delegated access — allowing one application to act on behalf of a user to access another service."

---

## Q5: Common interview trap — "OAuth is for authentication"

**Plain Answer:**  
**This is wrong.** OAuth 2.0 is for **authorization only**. It tells you what an app is allowed to do, not who the user is. Using OAuth alone, you can't reliably identify the user.

**Why "Login with Google" isn't pure OAuth:**  
It's actually **OpenID Connect** (OAuth + identity layer). The `id_token` is what tells you who the user is. The access token just lets you call Google APIs.

**Interview Template Answer:**  
> "A common misconception I see even among experienced developers is treating OAuth as an authentication protocol. It isn't — it's purely for authorization. After an OAuth flow, you know an app has been granted certain permissions, but you don't technically know who the user is from the spec alone. Some implementations put a user ID endpoint behind the access token, but that's not standardized. OpenID Connect was created specifically to add the identity layer on top of OAuth — the `id_token` JWT is what carries the user's identity in a standard, verifiable way. When you see 'Login with Google/GitHub/Facebook', that's OIDC, not raw OAuth 2.0, even though the underlying authorization flow is OAuth."

---

## The Full Picture

```
You want to...                          Use...
─────────────────────────────────────────────────────
Know who a user is (your own app)    → JWT (self-issued)
Grant app access to another service  → OAuth 2.0
Know who a user is via third party   → OpenID Connect (OAuth + JWT id_token)
Secure a microservice internally     → JWT (service-to-service)
Format your OAuth access token       → JWT (as access_token format)
```

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| Can OAuth access tokens be opaque? | Yes — opaque tokens require introspection; JWTs are self-contained |
| What is token introspection? | RFC 7662 — lets a resource server ask the auth server if a token is still valid |
| Is OIDC always JWT? | The `id_token` is always a JWT; access tokens in OIDC may or may not be JWTs |
| What is the `/.well-known/openid-configuration`? | OIDC discovery endpoint — publishes issuer, JWKS URI, supported scopes and flows |