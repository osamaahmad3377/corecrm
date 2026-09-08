# Security

## Principles

1. **Server-side authorization on every action.** UI hiding is never the control.
2. **Organization isolation.** `organizationId` comes from the authenticated
   session, never from request input.
3. **Least privilege.** RBAC matrix in `src/server/auth/rbac.ts`.
4. **Secrets never reach the client.** Password hashes, OAuth client secrets,
   refresh tokens, the encryption key and DB credentials stay server-side.

## Controls

| Area | Control |
| --- | --- |
| AuthN | Auth.js Credentials, bcrypt cost 12, constant-ish timing for unknown users |
| Sessions | JWT in `httpOnly` + `Secure` + `SameSite=Lax` cookie, 8h |
| AuthZ | `requireAuth` / `requireInternal` / `requirePermission` / `requireOrgAccess` in every server action + protected route |
| Org isolation | Client queries forced to `ctx.organization.id`; cross-org read → `FORBIDDEN`; internal notes filtered from client payloads |
| Injection | Prisma parameterized queries only; no raw SQL |
| XSS | `sanitize-html` allowlist for ticket messages; stricter allowlist for email bodies, additionally rendered in a `sandbox=""` iframe |
| CSRF | Auth.js CSRF token; server actions are same-origin POST; OAuth `state` param |
| Secrets at rest | OAuth tokens AES-256-GCM (`src/lib/crypto.ts`, `ENCRYPTION_KEY`) |
| OAuth tokens | Never returned by any API, never logged, never sent to client JS |
| File upload | MIME + extension allowlist, 20 MB cap, SHA-256 checksum, private blobs, download only via `/api/files/[id]` after `canAccessFile()` |
| Transport / headers | `next.config.ts`: HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false` |
| Rate limiting | Login, password reset, invite accept, upload, email send, webhooks (`src/lib/rate-limit.ts`) |
| Webhooks | MS: `validationToken` handshake + `clientState` check. Google: Pub/Sub OIDC audience check. Both idempotent, fail-soft (2xx), logged |
| Cron | `Authorization: Bearer $CRON_SECRET` required |
| Audit | `AuditLog` append-only for user/org/ticket/email/role/settings changes, with IP + UA |
| Errors | `AppError` taxonomy; internal errors return a generic message, detail logged server-side only |

## Content Security Policy

Set in `next.config.ts`. `default-src 'self'`; scripts `'self' 'unsafe-inline'`
(Next runtime; `'unsafe-eval'` in dev only); `frame-src 'self' blob:` for
sandboxed email rendering; `object-src 'none'`; `frame-ancestors 'none'`.

## Data a client can see

Only: their organization, its authorized users, its tickets, **public** ticket
messages, permitted attachments, its assets and contacts, its own notifications.

Never: internal notes, internal activity, other organizations, other clients,
audit data, OAuth tokens, internal metrics.

## Reporting

Run `npm run security-review` style checks before release. Key test:
`tests/integration/ticket-flow.test.ts` — cross-org access is refused;
`tests/integration/email-threading.test.ts` — ingestion is idempotent.

## Pre-deploy checklist

- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY` (32-byte base64), `CRON_SECRET`,
      `EMAIL_WEBHOOK_SECRET` set to strong unique values
- [ ] `DATABASE_URL` uses TLS (`sslmode=require` on managed Postgres)
- [ ] `APP_URL` / `NEXTAUTH_URL` are the production HTTPS domain
- [ ] OAuth redirect URIs registered for the production domain
- [ ] Upstash Redis configured (multi-region rate limiting)
- [ ] Vercel Blob token set (`BLOB_READ_WRITE_TOKEN`)
- [ ] `prisma migrate deploy` run; seed **not** run against real data
