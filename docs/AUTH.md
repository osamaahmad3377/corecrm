# Authentication & Authorization

## Authentication (Auth.js / NextAuth v5)

- **Provider:** Credentials (email + password). `src/server/auth/index.ts`.
- **Session:** JWT, `httpOnly` + `Secure` + `SameSite=Lax` cookie, 8-hour
  lifetime (`SESSION_MAX_AGE`). Credentials + database sessions aren't supported
  together in Auth.js, so JWT is used; the `Session` table is reserved for future
  OAuth/SSO providers.
- **Password hashing:** bcrypt, cost 12 (`src/server/auth/password.ts`).
  `verifyPassword` runs a dummy hash for unknown users to keep timing flat.
- **Edge safety:** `src/server/auth/config.ts` is edge-safe (no DB, no Node
  APIs) and is what `middleware.ts` uses. The Credentials provider (Prisma +
  bcrypt) is only added in `src/server/auth/index.ts` for the Node runtime.

### JWT / session claims

`jwt` and `session` callbacks put these on `session.user`:
`id`, `email`, `name`, `isInternal`, `internalRole`, `organizationId`,
`organizationRole`, `timezone`.

## Onboarding — invitation flow

Passwords are **never** set or stored by an admin.

1. Admin creates the user + an `Invitation` (hashed token, 72h expiry). A `User`
   shell is pre-created with `status = INVITED` and the org link is wired.
2. Invitation email → `/invite/<token>`.
3. `acceptInvitation()` verifies the token, checks password strength, hashes the
   password, sets `status = ACTIVE` + `emailVerified`, marks the invite accepted.
4. The user is signed in and redirected (`/admin` or `/portal`).

Duplicate active invitations for one email are rejected; creating a new invite
expires older `PENDING` ones.

## Password reset

`/forgot-password` → `requestPasswordReset()` always responds identically
(no user enumeration). A `VerificationToken` (`purpose = PASSWORD_RESET`,
60-minute expiry) is created; email → `/reset-password?token=…` →
`resetPassword()`.

## Rate limiting & brute force

`src/lib/rate-limit.ts` — sliding window, Upstash Redis when configured, else
in-memory. Applied to: login (10 / 10 min per IP), password reset (5 / 15 min),
invitation accept (10 / 10 min), upload, email send, webhooks.

## Authorization — RBAC

`src/server/auth/rbac.ts` is the single decision point.

### Roles

Internal (global, `User.internalRole`): `SUPER_ADMIN`, `ADMIN`,
`SUPPORT_MANAGER`, `SUPPORT_AGENT`.
Client (per-org, `OrganizationUser.role`): `CLIENT_ADMIN`, `CLIENT_USER`.

### Matrix (excerpt)

| Capability | SUPER | ADMIN | S.MGR | S.AGENT | C.ADMIN | C.USER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Manage internal users / roles | ✅ | ✅ | — | — | — | — |
| System settings | ✅ | ✅ | — | — | — | — |
| Audit log | ✅ | ✅ | — | — | — | — |
| Create / disable organizations | ✅ | ✅ | — | — | — | — |
| Onboard client users | ✅ | ✅ | ✅ | — | own org | — |
| Categories / priorities / SLA | ✅ | ✅ | ✅ | — | — | — |
| View all tickets | ✅ | ✅ | ✅ | ✅ | — | — |
| Assign / reassign | ✅ | ✅ | ✅ | — | — | — |
| Change status / priority | ✅ | ✅ | ✅ | ✅ | reopen only | — |
| Public reply | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Internal notes (add + see) | ✅ | ✅ | ✅ | ✅ | — | — |
| Connect / disconnect mailboxes | ✅ | ✅ | — | — | — | — |
| Email inbox / send | ✅ | ✅ | ✅ | ✅ | — | — |
| Convert email → ticket | ✅ | ✅ | ✅ | ✅ | — | — |
| Reports | ✅ | ✅ | ✅ | limited | — | — |

Full matrix in `rbac.ts` (`INTERNAL_MATRIX`, `CLIENT_MATRIX`).

### Guards (`src/server/auth/context.ts`)

```ts
await requireAuth();                       // any signed-in user → AuthContext
await requireInternal("SUPPORT_MANAGER");  // internal staff ≥ rank
await requirePermission("ticket.assign");  // RBAC matrix check
await requireOrgAccess(orgId, { write });  // client → own org only
```

Every server action and protected route handler calls one of these **before**
touching data. `middleware.ts` only routes; it is not the control.

### Organization isolation

- `listTickets()` forces `where.organizationId = ctx.organization.id` for client
  users; it is never taken from request input.
- `getTicketForContext()` throws `FORBIDDEN` if a client's org ≠ the ticket's org.
- Internal-note messages and internal activity types are filtered out of the
  payload for non-internal viewers — not merely hidden in the UI.
- Integration test `tests/integration/ticket-flow.test.ts` asserts a user from
  another organization gets a thrown error, and that `listTickets` is scoped.

## SSO readiness

`authConfig.providers` is an array; adding Entra ID / Google Workspace / a SAML
or OIDC provider is additive. `Account` + `Session` adapter tables already exist.
`User` carries `image` and `emailVerified`. No schema rewrite needed.
