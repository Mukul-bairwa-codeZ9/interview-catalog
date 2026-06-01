# Authentication vs Authorization

## The One-Line Difference

> **Authentication** = *Who are you?*
> **Authorization** = *What are you allowed to do?*

---

## Plain English

Imagine a hotel:

- You show your **ID at the front desk** → that's **Authentication** (proving who you are)
- Your **room key only opens room 204** → that's **Authorization** (what you're allowed to access)

You can't have Authorization without Authentication first.

---

## Real System Example

```
User logs in with email + password
        ↓
Server verifies credentials          ← AUTHENTICATION
        ↓
Server checks if user is admin       ← AUTHORIZATION
        ↓
Admin can delete posts, regular users cannot
```

---

## Common Interview Trap

> "Can Authorization happen without Authentication?"

**Answer:** Technically yes — some resources are public (no auth needed), so the system authorizes access to anyone. But in protected systems, Authentication always comes first.

---

## Authentication Methods

| Method | How it works | Example |
|--------|-------------|---------|
| Password | User knows a secret | Login forms |
| Token | User possesses a signed token | JWT, API keys |
| Biometric | User is physically unique | Face ID, fingerprint |
| MFA | Combination of above | OTP + password |

---

## Authorization Models

| Model | Description | Example |
|-------|-------------|---------|
| RBAC | Role-Based Access Control | Admin, Editor, Viewer roles |
| ABAC | Attribute-Based | "Users from India, aged 18+" |
| ACL | Access Control List | File permissions per user |

---

## Key Terms to Know

- **Identity Provider (IdP)** — the service that authenticates users (Google, Auth0, your own server)
- **Principal** — the entity being authenticated (a user, service, or device)
- **Credential** — what the principal presents to prove identity (password, token, certificate)
- **Claims** — statements about the principal after authentication (name, role, email)

---

## Interview Answer Template

*"Authentication verifies the identity of a user — are they who they claim to be. Authorization determines what that verified user is permitted to do. In a typical system, authentication happens first via credentials or tokens, and then authorization checks are applied to each resource or action the user tries to perform."*