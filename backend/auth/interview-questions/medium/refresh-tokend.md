# Refresh Tokens

**Difficulty:** 🟡 Medium  
**Asked by:** Spotify, Twitter/X, Notion, Stripe, fintech companies, any app with auth

---

## Q1: Why do we need refresh tokens? Why not just use long-lived access tokens?

**Plain Answer:**  
Access tokens are sent with every request → more exposure → higher theft risk. If stolen, a long-lived access token gives an attacker extended access. Short-lived access tokens limit this window. Refresh tokens solve the UX problem of re-logging in frequently — they're stored more securely and used less often.

**The Trade-off:**

| | Long-lived Access Token | Short Access + Refresh Token |
|---|---|---|
| **Convenience** | ✅ Always valid | ✅ Seamless (auto-refresh) |
| **Security** | ❌ Stolen = long-term access | ✅ Stolen = short window |
| **Revocation** | ❌ Hard to revoke | ✅ Revoke refresh token = game over |

**Interview Template Answer:**  
> "Access tokens are credentials sent with every API request, which means they're frequently transmitted and more likely to be intercepted. A long-lived access token stolen in transit or from a client-side vulnerability gives an attacker extended access. Short-lived access tokens (15–60 min) limit this window. The refresh token pattern solves the UX problem: instead of re-authenticating constantly, the client silently exchanges the refresh token for a new access token when the current one expires. Refresh tokens are used infrequently and can be stored more securely — in HttpOnly cookies or secure storage on mobile. This separation of concerns gives you both security and good UX."

---

## Q2: How does the refresh token flow work?

**Plain Answer:**  
```
1. User logs in
2. Server issues: access token (short-lived) + refresh token (long-lived)
3. Client uses access token for API calls
4. Access token expires → client sends refresh token to /auth/refresh
5. Server validates refresh token → issues NEW access token (+ optionally new refresh token)
6. Client uses new access token
7. If refresh token expires/revoked → user must log in again
```

**Interview Template Answer:**  
> "On login, the server issues two tokens: a short-lived access token (say, 15 minutes) and a long-lived refresh token (say, 7 days). The client uses the access token for all API requests. When the access token expires, instead of forcing re-login, the client sends the refresh token to a dedicated `/auth/refresh` endpoint. The server looks up the refresh token in the database, validates it hasn't been used, revoked, or expired, and issues a new access token — and optionally, a new refresh token. The old refresh token is invalidated. This token rotation pattern means even if a refresh token is stolen, it can only be used once before becoming invalid."

---

## Q3: Where should refresh tokens be stored?

**Plain Answer:**  
- **Web**: HttpOnly cookie (JS can't read it, resistant to XSS)
- **Mobile**: Platform secure storage (iOS Keychain, Android Keystore)
- **Never**: localStorage, sessionStorage (accessible to JS → XSS risk)

**Interview Template Answer:**  
> "Refresh tokens should be stored with the highest security because they're long-lived and can generate new access tokens. On web apps, the best option is an HttpOnly cookie — JavaScript cannot access it, eliminating XSS as a theft vector. The cookie should also have `Secure` (HTTPS only) and `SameSite=Strict` or `Lax` attributes to prevent CSRF. On mobile, platform-native secure storage like iOS Keychain or Android Keystore is the right choice — they're hardware-backed and inaccessible to other apps. localStorage is a common but dangerous choice that should be avoided for refresh tokens."

---

## Q4: What is refresh token rotation?

**Plain Answer:**  
Every time a refresh token is used, it gets **replaced with a new one** and the old one is invalidated. This means a stolen refresh token can only be used once — the moment it's used (by attacker or legitimate client), the other party gets an error and knows something is wrong.

**Reuse Detection:**
```
Legit user uses RT#1 → gets AT + RT#2 (RT#1 invalidated)
Attacker steals RT#1, tries to use it → REJECTED (already used)
Legit user uses RT#2 → server sees RT#1 was reused → REVOKE ALL tokens for this user
```

**Interview Template Answer:**  
> "Refresh token rotation means each refresh token can only be used once. When a client exchanges a refresh token, the server issues a new refresh token and immediately invalidates the old one. This enables reuse detection: if a rotation happens and the old token is used again — either by the legitimate client or an attacker — the server knows something is wrong and can revoke all tokens for that user, forcing a full re-login. This is the most secure refresh token pattern and is recommended by OAuth 2.0 best practices (RFC 9449). It effectively makes refresh tokens single-use, limiting the damage from theft."

---

## Q5: How do you revoke a refresh token?

**Plain Answer:**  
Refresh tokens must be stored server-side (in a database or Redis) to support revocation. Unlike access tokens (which are stateless JWTs), refresh token revocation requires a lookup.

**Revocation triggers:**
- User logs out → delete refresh token from DB
- User changes password → delete all refresh tokens for that user
- Suspicious activity detected → delete all refresh tokens for that user
- Admin revokes session → delete specific refresh token

**Interview Template Answer:**  
> "Unlike access tokens, refresh tokens need to be stored server-side to be revocable — typically in a database table or Redis with the user ID, token hash, expiry, and a revoked flag. On logout, we delete or flag the token as revoked. On password change or suspected compromise, we revoke all refresh tokens for that user. When a client presents a refresh token, we check the database: is it valid, not expired, and not revoked? This is the one place where auth becomes stateful again, but it's necessary for security. Using Redis for this lookup keeps it fast — sub-millisecond lookups even at scale."


## Q6: What happens if refresh token is stolen before use? 

"If an attacker steals a refresh token and uses it before the legitimate user, they will successfully obtain a new access and refresh token pair. However, modern authentication mechanisms handle this using Refresh Token Rotation with Automatic Reuse Detection. >
The moment the legitimate user's client attempts to use that same, now-compromised refresh token, the authorization server detects a replay attack because the token has been flagged as 'already spent'. Because the server cannot distinguish who is the attacker and who is the victim, it triggers a breach protocol: it immediately invalidates the entire token family, killing the attacker's ability to refresh, and forces a hard logout on the victim client, requiring a clean re-authentication."
---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| What's the ideal access token lifetime? | 15 minutes for high-security, up to 1 hour for general apps |
| What's the ideal refresh token lifetime? | 7–30 days, depending on security requirements |
| Should access tokens be stored in DB? | No — they're stateless; only refresh tokens need DB storage |
| What happens if refresh token is stolen before use? | Attacker gets one rotation, reuse detection should catch it and revoke all |
| How does "remember me" work? | Longer-lived refresh token (30 days) vs short one (session-only) |


