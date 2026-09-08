# Architecture

CoreCRM is a **single-tenant** IT Support & Client Portal. One company runs one
application against one PostgreSQL database. Many *client organizations* live
inside that database; the **Organization** is the security boundary for client
data. There is deliberately **no `Tenant` model / `tenantId`**.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) · React 19 · TypeScript (strict) |
| UI | Tailwind CSS v4 · shadcn/ui · Lucide · Recharts |
| Data access | Server Actions + Route Handlers |
| ORM / DB | Prisma 6 · PostgreSQL 16 |
| Auth | Auth.js (NextAuth v5) — Credentials + JWT sessions |
| Validation | Zod (shared client + server) |
| Email | `EmailProvider` abstraction → Microsoft Graph, Gmail |
| Transactional mail | Resend (optional; logs to server in dev) |
| Object storage | Vercel Blob (on-disk fallback in dev) |
| Rate limiting | Upstash Redis (in-memory fallback) |
| Background work | Vercel Cron + provider webhooks (no long-running workers) |
| Tests | Vitest (unit + integration) · Playwright (e2e) |

## Layering

```
Browser (admin app / client portal)
        │  secure session cookie (JWT)
        ▼
Next.js on Vercel
  ├── src/app/(auth)          login / invite / reset
  ├── src/app/admin/*         internal staff UI          (layout guards: internal)
  ├── src/app/portal/*        client UI                   (layout guards: client + org)
  ├── src/app/api/*           route handlers, webhooks, cron
  ├── src/server/actions/*    "use server" entrypoints — parse (Zod) + authorize + call service
  ├── src/server/services/*   business logic (framework-agnostic, `import "server-only"`)
  ├── src/server/providers/*  EmailProvider interface + Microsoft + Gmail
  ├── src/server/auth/*       session, RBAC matrix, org-access guards
  ├── src/server/storage/*    StorageProvider interface + Vercel Blob / local
  └── src/server/db/client.ts Prisma singleton
        ▼
PostgreSQL   ·   Vercel Blob   ·   MS Graph / Gmail APIs   ·   Upstash Redis
```

**Rule:** UI components never import Prisma or a provider SDK. The flow is always
`UI → server action / route handler → service → repository / provider`. Every
service function receives an `AuthContext` and performs its own authorization +
organization scoping — callers cannot bypass it.

## Request authorization

`src/server/auth/context.ts` builds an `AuthContext` from the session:

```ts
interface AuthContext {
  userId: string;
  email: string;
  name: string;
  isInternal: boolean;
  internalRole: InternalRole | null;              // internal staff
  organization: { id: string; role: ClientRole } | null;  // client users
  timezone: string;
}
```

Guards:

- `requireAuth()` — any signed-in user
- `requireInternal(minRole)` — internal staff at/above a rank
- `requirePermission(permission)` — checks the RBAC matrix (`can()`)
- `requireOrgAccess(orgId, { write })` — client users may only touch their own org

`middleware.ts` is a coarse routing guard only (keeps clients out of `/admin`,
staff out of `/portal`, unauthenticated users out of both). It is **never** the
authorization control.

## Directory map

```
src/
  app/
    (auth)/          login, forgot-password, reset-password, invite/[token]
    admin/           dashboard, tickets, organizations, contacts, emails,
                     assets, reports, team, settings
    portal/          dashboard, tickets, organization, users, notifications, profile
    api/             auth, tickets(actions), emails/*, webhooks/{microsoft,google},
                     cron/{email-sync,sla-check}, search, upload, files/[id], notifications
  components/        design system (badges, states, charts, data-pagination…),
                     app-shell/, tickets/, organizations/, emails/, users/, settings/
  lib/               env, errors, crypto, rate-limit, sanitize, format,
                     design-tokens, constants, api, logger, utils
  server/
    actions/         tickets, organizations, contacts, users, assets, emails, settings
    services/        ticket, ticket-number, sla, organization, contact, user, asset,
                     invitation, notification, audit, search, settings, lookups,
                     email-account, email-ingest, email-send, file-access
    providers/email/ types, microsoft, gmail, factory
    auth/            config (edge-safe), index (Node), context, rbac, password
    storage/         index (StorageProvider + Vercel Blob + local)
    mailer/          index (Resend / dev log)
    email-templates/ index (HTML templates)
    db/              client
  validators/        common, auth, organization, contact, ticket, user, asset
prisma/              schema.prisma, migrations/, seed.ts
docs/                this folder
tests/               unit/, integration/, e2e/
```

## Data model summary

See [DATABASE.md](DATABASE.md). Highlights:

- **Ticket** has a UUID `id` (relationships) and a human `ticketNumber`
  (`TKT-YYYY-NNNNNN`, gap-free via a per-year `Counter` row inside the create
  transaction).
- **TicketMessage.messageType** is `PUBLIC_REPLY | INTERNAL_NOTE`. Internal notes
  are filtered out server-side for any non-internal viewer — never sent to the
  client and then hidden.
- **EmailMessage** has `@@unique([emailAccountId, providerMessageId])` — the
  idempotency key that makes webhook + cron + manual sync converge without dupes.
- Configurable lookups: `TicketStatus`, `TicketPriority`, `TicketCategory`,
  `SlaPolicy`/`SlaTarget` — seeded, not hard-coded in code.

## Notifications

`notificationService` exposes intent methods (`notifyTicketCreated`,
`notifyClientTicketCreated`, `notifyTicketAssigned`, `notifyReply`,
`notifyStatusChanged`, `notifyResolved`, `notifySlaBreached`). Each fans out to
channels: **in-app** (`Notification` rows) and **email** (templated, via the
mailer). SMS / push are future channels that plug in without touching callers.

## Background work (serverless-safe)

- **Webhooks** — `/api/webhooks/microsoft` (Graph change notifications, validates
  the handshake + `clientState`), `/api/webhooks/google` (Pub/Sub push, verifies
  the OIDC audience). Both ingest idempotently and return fast.
- **Cron** (`vercel.json`) — `/api/cron/email-sync` every 10 min renews expiring
  subscriptions and does a reconciliation delta sync; `/api/cron/sla-check` every
  5 min flags SLA breaches and notifies. Both require `CRON_SECRET`.
- No permanent workers, no in-memory queues, no local filesystem in production.

## Phases

1. **Foundation + Ticketing** *(implemented)* — auth, RBAC, organizations, users,
   invitations, contacts, tickets, conversation, internal notes, assignment,
   status/priority, categories, attachments, activity, dashboards, audit,
   in-app + email notifications, command palette.
2. **Email Center** *(implemented, needs OAuth credentials to go live)* —
   `EmailProvider` abstraction, Microsoft Graph + Gmail, account management,
   inbox, send/reply from mailbox, threading + dedup, email→ticket, ticket→email,
   webhooks, cron sync.
3. **Service depth** *(implemented)* — SLA computation + breach cron, reports,
   assets, email↔org/team mapping, settings.
4. **Automation** *(schema + hook points ready; rules engine not built)*.
