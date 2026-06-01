# Authentication vs Authorization

**Difficulty:** 🟢 Easy  
**Asked by:** Google, Amazon, Meta, Microsoft, almost every company in system design rounds

---

## Q1: What is the difference between Authentication and Authorization?

**Plain Answer:**  
- **Authentication** = *Who are you?* → Verifying identity (login)  
- **Authorization** = *What can you do?* → Verifying permissions (access control)

Authentication always happens **before** authorization.

**Analogy:**  
Think of a hotel:
- **Authentication** = Showing your ID at check-in → "Yes, you are John Doe"
- **Authorization** = Your room key only opens Room 204, not Room 500 → "You can access this, not that"

**Interview Template Answer:**  
> "Authentication is the process of verifying who a user is — typically through credentials like a username and password, a token, or biometrics. Authorization comes after authentication and determines what that verified user is allowed to do or access. For example, in a banking app, authentication confirms you're the account holder, while authorization ensures you can only view your own accounts and not someone else's. These are often confused but are fundamentally separate concerns — you can be authenticated but still unauthorized to access a specific resource."

---

## Q2: Can you be authenticated but not authorized?

**Plain Answer:**  
Yes. A logged-in user (authenticated) may try to access an admin panel they don't have permission for (not authorized). The system knows who you are, but refuses the action.

**Analogy:**  
You've checked into the hotel (authenticated), but you try to enter the VIP lounge — your key doesn't work (not authorized).

**Interview Template Answer:**  
> "Absolutely. Authentication and authorization are independent checks. A common example: a regular user logs into a SaaS platform successfully — they're authenticated. But if they try to access `/admin/settings`, the server returns a `403 Forbidden` because they lack the required role or permission. HTTP makes this distinction clear: `401 Unauthorized` means you're not authenticated, while `403 Forbidden` means you're authenticated but not authorized."

---

## Q3: What HTTP status codes map to auth vs authz failures?

**Plain Answer:**  
- `401 Unauthorized` → Not authenticated (confusingly named, but means "please log in")
- `403 Forbidden` → Authenticated but not authorized

**Interview Template Answer:**  
> "HTTP 401 is returned when the request lacks valid credentials — the user needs to log in or provide a valid token. HTTP 403 means the server knows who the user is but refuses access because they don't have permission. In a REST API, you'd return 401 when the JWT is missing or expired, and 403 when the user is logged in but tries to access a resource they don't own or don't have the role for."

---

## Q4: How are authentication and authorization implemented in a typical backend?

**Plain Answer:**  
- **Authentication**: Login endpoint validates credentials → issues a token (JWT or session)
- **Authorization**: Middleware checks the token + user roles/permissions on each protected route

**Interview Template Answer:**  
> "In a typical Express.js backend, authentication is handled in the login route — we validate the user's credentials against the database, and if correct, we issue a JWT. Authorization is then handled by middleware on protected routes. The middleware decodes the JWT to get the user's identity, then checks their role or permissions (stored in the token or fetched from DB) to decide if the request should proceed. This keeps auth concerns separated and reusable across routes."

---

## Common Follow-up Questions

| Question | One-line Answer |
|---|---|
| What is RBAC? | Role-Based Access Control — permissions tied to roles, roles tied to users |
| What is ABAC? | Attribute-Based Access Control — more granular, based on user/resource attributes |
| Where does OAuth fit? | OAuth is an **authorization** framework — it lets apps access resources on your behalf |
| Is JWT auth or authz? | JWT is used for both — it carries identity (auth) and can carry claims/roles (authz) |