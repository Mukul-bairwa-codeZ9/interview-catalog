# OAuth 2.0 Basics

## What is OAuth 2.0?

OAuth 2.0 is an **authorization framework** — not an authentication protocol — that lets a user grant a third-party application limited access to their resources on another service, **without sharing their password**.

> Real-world analogy: A hotel gives you a key card. You give it to a valet. The valet can move your car but can't access your room. OAuth does this for apps.

---

## The Problem OAuth Solves

**Without OAuth:**
> "Sign in with Google" would require you to give your Google password to the third-party app. That app now has full access to everything. If it's hacked, your Google account is exposed.

**With OAuth:**
> The app gets a limited-scope access token from Google. It can read your email, but not change your password. You can revoke it anytime.

---

## The 4 Roles

| Role | Who/What | Example |
|------|----------|---------|
| **Resource Owner** | The user who owns the data | You |
| **Client** | The app requesting access | A todo app wanting your Google Calendar |
| **Authorization Server** | Issues access tokens | Google's OAuth server |
| **Resource Server** | Hosts the protected resource | Google Calendar API |

---

## OAuth 2.0 Grant Types

| Grant Type | Use Case |
|-----------|---------|
| **Authorization Code** | Web apps with server-side code (most secure) |
| **Authorization Code + PKCE** | Mobile/SPA apps (no server secret) |
| **Client Credentials** | Machine-to-machine (no user involved) |
| **Implicit** | ⚠️ Deprecated. Was for SPAs, replaced by PKCE |

---

## Authorization Code Flow (The Important One)

```
User                  Client App            Auth Server       Resource Server
 |                        |                      |                  |
 | Click "Login w/ Google"|                      |                  |
 |----------------------->|                      |                  |
 |                        | Redirect to Auth URL |                  |
 |                        |--------------------->|                  |
 |                        |                      |                  |
 | Login + consent screen |                      |                  |
 |<--------------------------------------------|                  |
 |                        |                      |                  |
 | Grant permission       |                      |                  |
 |-------------------------------------------->|                  |
 |                        |                      |                  |
 |                        | Redirect with ?code= |                  |
 |                        |<---------------------|                  |
 |                        |                      |                  |
 |                        | POST /token          |                  |
 |                        | { code, client_secret|                  |
 |                        |--------------------->|                  |
 |                        |                      |                  |
 |                        | { access_token,      |                  |
 |                        |   refresh_token }    |                  |
 |                        |<---------------------|                  |
 |                        |                      |                  |
 |                        | GET /calendar        |                  |
 |                        | Bearer access_token  |                  |
 |                        |---------------------------------->|      |
 |                        |                                  |      |
 |                        | Calendar data                    |      |
 |                        |<----------------------------------|      |
```

---

## Step-by-Step Breakdown

**Step 1: Redirect to Auth Server**
```
GET https://accounts.google.com/o/oauth2/auth?
  client_id=YOUR_APP_ID
  &redirect_uri=https://yourapp.com/callback
  &response_type=code
  &scope=calendar.read
  &state=random_csrf_token
```

**Step 2: User logs in and grants consent**
Google shows: *"YourApp wants to read your calendar. Allow?"*

**Step 3: Auth server returns a code**
```
GET https://yourapp.com/callback?code=AUTH_CODE&state=random_csrf_token
```

**Step 4: App exchanges code for tokens (server-side)**
```
POST https://oauth2.googleapis.com/token
{
  "code": "AUTH_CODE",
  "client_id": "YOUR_APP_ID",
  "client_secret": "YOUR_SECRET",
  "redirect_uri": "https://yourapp.com/callback",
  "grant_type": "authorization_code"
}
```

**Step 5: Receive tokens**
```json
{
  "access_token": "ya29.xxx",
  "refresh_token": "1//xxx",
  "expires_in": 3600,
  "scope": "calendar.read"
}
```

**Step 6: Use access token to call resource server**
```
GET https://www.googleapis.com/calendar/v3/events
Authorization: Bearer ya29.xxx
```

---

## PKCE Extension (For Mobile/SPAs)

**Problem:** Mobile apps can't safely store a `client_secret` — it would be bundled in the app binary and can be extracted.

**PKCE (Proof Key for Code Exchange)** solves this:
1. App generates a random `code_verifier`
2. Hashes it → `code_challenge`
3. Sends `code_challenge` with the auth request
4. Sends `code_verifier` when exchanging the code for tokens
5. Auth server verifies they match — proves the same app made both requests

---

## OAuth vs OpenID Connect (OIDC)

| | OAuth 2.0 | OIDC |
|--|-----------|------|
| Purpose | Authorization (what can you access) | Authentication (who are you) |
| Returns | Access Token | Access Token + ID Token (JWT) |
| Use for | Granting API access | "Login with Google" |

> OpenID Connect is built **on top of** OAuth 2.0. It adds an `id_token` (a JWT) that identifies the user.

---

## Key Security Points

- Always validate the `state` parameter to prevent CSRF
- Use `https` for redirect_uri — never `http` in production
- The auth code is single-use and short-lived (usually 10 minutes)
- Access tokens should have minimal scope (principle of least privilege)
- Use PKCE for any public client (mobile, SPA)

---

## Interview Answer Template

*"OAuth 2.0 is an authorization framework that allows a user to grant a third-party app limited access to their data on another service without giving that app their password. The most common flow is Authorization Code — the user is redirected to the auth server, grants permission, and the app receives a code which it exchanges server-side for access and refresh tokens. The key security benefit is that the user's credentials never touch the third-party app. OAuth itself is for authorization, not authentication — OpenID Connect builds on OAuth to add identity via an ID token."*