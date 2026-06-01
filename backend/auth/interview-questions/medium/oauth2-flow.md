# OAuth 2.0 Flow

**Difficulty:** 🟡 Medium  
**Asked by:** Google, GitHub, Stripe, Atlassian, any company building integrations or SSO

---

## Q1: What is OAuth 2.0 and what problem does it solve?

**Plain Answer:**  
OAuth 2.0 is an **authorization framework** that lets a user grant a third-party app limited access to their resources — without sharing their password.

**The problem it solves:**  
Before OAuth: "Give us your Gmail password so we can read your contacts." ← Terrible.  
With OAuth: Google asks you "Do you want to allow AppX to read your contacts?" ← Safe.

**Analogy:**  
Like giving a **valet key** to a parking attendant. It only unlocks and starts the car — it can't open the trunk or glove box. You give limited access without handing over your master key.

**Interview Template Answer:**  
> "OAuth 2.0 is an authorization framework, not an authentication protocol. It solves the problem of delegated access — allowing a third-party application to access resources on behalf of a user without the user sharing their credentials. For example, a calendar app can request access to your Google Calendar without knowing your Google password. OAuth 2.0 defines a set of flows (called grant types) for different scenarios — web apps, mobile apps, server-to-server. The key concept is that users grant scoped, revocable access to specific resources, and the authorization is expressed as an access token rather than credentials."

---

## Q2: What are the key roles in OAuth 2.0?

**Plain Answer:**

| Role | Who they are | Example |
|---|---|---|
| **Resource Owner** | The user who owns the data | You, the Gmail user |
| **Client** | The app requesting access | A third-party calendar app |
| **Authorization Server** | Issues tokens after user consent | Google's auth server (`accounts.google.com`) |
| **Resource Server** | Holds the protected resources | Gmail API (`gmail.googleapis.com`) |

**Interview Template Answer:**  
> "OAuth 2.0 defines four roles. The **resource owner** is the end user who grants permission. The **client** is the application requesting access — it could be a web app, mobile app, or server. The **authorization server** authenticates the user and issues access tokens after consent — this is often separate from the resource server. The **resource server** is the API that holds the protected data and accepts access tokens. In practice, Google's `accounts.google.com` is the authorization server and `gmail.googleapis.com` is the resource server — both are Google services, but they're architecturally separate roles."

---

## Q3: Explain the Authorization Code Flow step by step

**Plain Answer:**  
The most secure and common OAuth flow for web apps.

```
Step 1: User clicks "Login with Google" on your app
Step 2: App redirects to Google's auth server with:
        - client_id, redirect_uri, scope, response_type=code, state
Step 3: User logs into Google and grants permission
Step 4: Google redirects back to your app with:
        - authorization_code, state
Step 5: Your backend exchanges code for tokens (server-to-server):
        - POST to Google with: code, client_id, client_secret, redirect_uri
Step 6: Google returns: access_token, refresh_token, id_token
Step 7: Your app uses access_token to call Google APIs
```

**Why the code exchange?**  
The code is short-lived and meaningless alone. Exchanging it for tokens happens server-to-server — the client secret never goes to the browser.

**Interview Template Answer:**  
> "The Authorization Code flow is the most secure OAuth flow for server-side web applications. The user is redirected to the authorization server where they authenticate and grant consent. The auth server redirects back to the app with a short-lived authorization code. Critically, the app's backend then exchanges this code for tokens in a server-to-server call — this call includes the client secret. This two-step process keeps the client secret out of the browser and the access token out of the URL. The `state` parameter is also essential — it's a random value the app generates, sends with the initial redirect, and validates when the code comes back, preventing CSRF attacks on the OAuth flow."

---

## Q4: What are the other OAuth 2.0 grant types and when do you use them?

**Plain Answer:**

| Grant Type | Used For | Security Level |
|---|---|---|
| **Authorization Code** | Web apps with backend | ✅ Most secure |
| **Authorization Code + PKCE** | SPAs and mobile apps | ✅ Secure (no client secret) |
| **Client Credentials** | Server-to-server (no user) | ✅ Good for machine auth |
| **Device Code** | Smart TVs, CLIs | ✅ Good UX for limited input |
| **Implicit** *(deprecated)* | Old SPAs | ❌ Avoid — token in URL |
| **Resource Owner Password** *(deprecated)* | Legacy apps | ❌ Avoid — defeats OAuth purpose |

**Interview Template Answer:**  
> "There are several OAuth grant types for different scenarios. Authorization Code is for traditional web apps with a backend. Authorization Code with PKCE is for SPAs and mobile apps where a client secret can't be stored safely — PKCE replaces the client secret with a cryptographic challenge. Client Credentials is used for machine-to-machine communication with no user involved — like a microservice calling another microservice. The Device Code flow handles devices with limited input like smart TVs — the device shows a code and a URL, user authenticates on their phone, and the device polls for the token. The Implicit and Resource Owner Password flows are deprecated in OAuth 2.1 due to security issues."

---

## Q5: What are OAuth scopes?

**Plain Answer:**  
Scopes define **what the access token allows the app to do**. They express the level of access requested and granted. Users see these on the consent screen.

**Examples:**
```
Google scopes:
- https://www.googleapis.com/auth/gmail.readonly  → Read emails only
- https://www.googleapis.com/auth/calendar        → Full calendar access

GitHub scopes:
- repo        → Full repo access
- read:user   → Read user profile only
- write:org   → Write org data
```

**Interview Template Answer:**  
> "Scopes are how OAuth implements the principle of least privilege. When an app requests authorization, it specifies a list of scopes defining exactly what access it needs — read emails, write calendar events, access profile data. The user sees these on the consent screen and decides whether to approve. The authorization server encodes the granted scopes into the access token. When the resource server receives a request, it validates not just that the token is valid but that it has the required scope for the requested operation. If a token is stolen, the attacker is limited to what those scopes allow — they can't exceed the granted permissions."

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| Is OAuth authentication or authorization? | Authorization — use OpenID Connect (OIDC) on top of OAuth for authentication |
| What is OpenID Connect? | An identity layer on top of OAuth 2.0 that adds `id_token` and user info endpoint |
| What is the `state` parameter? | CSRF protection — random value sent and verified across the redirect |
| What is the difference between access token and authorization code? | Code is single-use, short-lived, and exchanged for tokens server-side; token is the actual credential |
| Can you use OAuth without a user? | Yes — Client Credentials grant is for server-to-server auth with no user involved |