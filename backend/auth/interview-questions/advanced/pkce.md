# PKCE (Proof Key for Code Exchange)

**Difficulty:** 🔴 Advanced  
**Asked by:** Auth0, Okta, Google, mobile-focused companies, senior backend/security roles

---

## Q1: What is PKCE and why was it created?

**Plain Answer:**  
PKCE (pronounced "pixy") is a security extension to the OAuth 2.0 Authorization Code flow. It was created to protect **mobile apps and SPAs** that cannot safely store a client secret.

**The problem without PKCE:**  
- Mobile apps can't store client secrets (they'd be extractable from the binary)
- Without a client secret, the authorization code exchange is unauthenticated
- An attacker who intercepts the authorization code can exchange it for tokens

**PKCE solution:**  
Replace the client secret with a **cryptographic challenge** generated at runtime — something the attacker who intercepts the code cannot know.

**Interview Template Answer:**  
> "PKCE was introduced in RFC 7636 to address a vulnerability in the Authorization Code flow for public clients — apps that can't store a client secret, like mobile apps or SPAs. Without a client secret, anyone who intercepts the authorization code can exchange it for tokens at the token endpoint. PKCE solves this by making the client prove it initiated the request — not by using a stored secret, but by using a cryptographic value generated fresh for each authorization request. Even if an attacker intercepts the code, they can't complete the exchange without the original random value that created the challenge."

---

## Q2: How does PKCE work? Walk me through the flow.

**Plain Answer:**  

```
Step 1: Client generates a random secret:
        code_verifier = random_string(43-128 chars)
        Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

Step 2: Client creates a challenge from it:
        code_challenge = BASE64URL(SHA256(code_verifier))
        Example: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

Step 3: Client sends code_challenge (not verifier!) in the auth request:
        GET /authorize?
          client_id=app123
          &redirect_uri=myapp://callback
          &response_type=code
          &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
          &code_challenge_method=S256

Step 4: Auth server stores the challenge, user authenticates, returns code

Step 5: Client sends code + the ORIGINAL verifier to token endpoint:
        POST /token
          code=AUTH_CODE
          &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
          &grant_type=authorization_code

Step 6: Auth server computes SHA256(code_verifier), compares to stored challenge
        If match → issue tokens ✅
        If no match → reject ❌
```

**Why this works against interception:**  
An attacker intercepts the authorization code but never sees the `code_verifier` (it's never sent until step 5, and it's never in the browser URL). They cannot reverse SHA256 to find the verifier. So the code is useless to them.

**Interview Template Answer:**  
> "PKCE works by having the client generate a random `code_verifier` at the start of each auth flow. It hashes this to create a `code_challenge` using SHA-256 and sends only the challenge in the authorization request. The verifier never leaves the client at this stage. After receiving the authorization code, the client sends the original `code_verifier` to the token endpoint. The authorization server rehashes it and compares it to the challenge it stored — if they match, only the original requester could have made this call. An attacker who intercepts the code has no idea what the `code_verifier` was, and SHA-256 is one-way, so they can't derive it from the challenge."

---

## Q3: What is the difference between S256 and plain PKCE?

**Plain Answer:**  
- **S256** (recommended): `code_challenge = BASE64URL(SHA256(code_verifier))` — secure, hash is one-way
- **plain** (not recommended): `code_challenge = code_verifier` — no hashing, vulnerable if challenge is intercepted

**Interview Template Answer:**  
> "PKCE supports two challenge methods. `S256` hashes the verifier with SHA-256 before sending it — even if an attacker intercepts the authorization request and sees the `code_challenge`, they can't reverse it to get the `code_verifier`. This is the required method for all new implementations. `plain` simply sends the verifier as the challenge with no hashing — it's only allowed when the client cannot perform SHA-256 hashing (extremely rare today). RFC 7636 strongly recommends S256, and most modern auth servers reject `plain` entirely. In practice, always use S256."

---

## Q4: Should PKCE replace client secrets for web apps with backends?

**Plain Answer:**  
**Yes — OAuth 2.1 recommends PKCE for ALL clients**, including confidential clients (those that can store secrets). PKCE adds protection against authorization code interception even when a client secret is present.

**Before OAuth 2.1**: PKCE was only for public clients  
**OAuth 2.1**: PKCE is required for everyone

**Interview Template Answer:**  
> "OAuth 2.1, which consolidates best practices from the original OAuth 2.0 spec, mandates PKCE for all authorization code flows — not just for public clients. The reasoning is defense in depth: even for server-side web apps that have a client secret, PKCE adds an additional layer of protection against authorization code interception attacks. The client secret alone protects the token exchange, but PKCE also ensures the entity that received the code is the same one that initiated the flow. Using both is strictly stronger, and OAuth 2.1 makes this the standard. Modern auth libraries apply PKCE by default for all clients."

---

## Q5: How is PKCE implemented in a SPA or mobile app?

**Plain Answer (SPA — JavaScript):**
```js
// Step 1: Generate code verifier
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Step 2: Generate code challenge
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Step 3: Store verifier, redirect with challenge
const verifier = generateCodeVerifier();
sessionStorage.setItem('pkce_verifier', verifier); // Store temporarily
const challenge = await generateCodeChallenge(verifier);

window.location.href = `https://auth.example.com/authorize?
  client_id=abc
  &redirect_uri=https://myapp.com/callback
  &response_type=code
  &code_challenge=${challenge}
  &code_challenge_method=S256`;

// Step 4: On callback, exchange code + verifier for tokens
const verifier = sessionStorage.getItem('pkce_verifier');
const response = await fetch('https://auth.example.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: urlParams.get('code'),
    redirect_uri: 'https://myapp.com/callback',
    client_id: 'abc',
    code_verifier: verifier,
  })
});
```

**Interview Template Answer:**  
> "In a SPA, PKCE is implemented using the Web Crypto API for secure random generation and SHA-256 hashing. The code verifier is a cryptographically random string generated before the redirect. It's stored temporarily in sessionStorage — not localStorage, because we only need it for one flow. The SHA-256 hash of the verifier becomes the challenge, which is URL-safe Base64-encoded and included in the authorization redirect. When the callback returns the authorization code, the SPA retrieves the verifier from sessionStorage and sends it alongside the code in the token request. Libraries like `oidc-client-ts` or `@auth0/auth0-react` handle all of this automatically."

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| Is PKCE a replacement for client secret? | For public clients yes; for confidential clients, use both |
| Where do you store the code verifier in a SPA? | sessionStorage — short-lived, tab-scoped |
| Can PKCE be used with refresh tokens? | Yes — PKCE only protects the code exchange; refresh tokens work normally after |
| What RFC defines PKCE? | RFC 7636 (original), RFC 9700 (OAuth 2.1 incorporating PKCE) |
| Does the server need changes to support PKCE? | Yes — auth server must store and validate code challenges |