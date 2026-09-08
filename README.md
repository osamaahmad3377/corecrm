# CoreCRM — IT Support & Client Portal

A production-grade, **single-tenant** IT support / helpdesk system for an IT
services company. One company runs one app; many client organizations live
inside it. The **Organization** is the security boundary for client data.

- **Internal staff** run the helpdesk: onboard clients, triage/assign/resolve
  tickets, and talk to clients through connected support mailboxes.
- **Client users** log into a separate portal, raise and track tickets, attach
  files, and reply to support.

Built for **Vercel** + external **PostgreSQL** + **Vercel Blob**.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Prisma 6 / PostgreSQL · Auth.js (NextAuth v5) · Zod · Recharts ·
Microsoft Graph + Gmail (email) · Vitest + Playwright.

## Quick start

```bash
# 1. Local Postgres (Docker)
docker compose up -d

# 2. Env
cp .env.example .env
#   Generate secrets:
#   AUTH_SECRET     -> npx auth secret
#   ENCRYPTION_KEY  -> openssl rand -base64 32
#   The default DATABASE_URL matches docker-compose (localhost:5433).

# 3. Install, migrate, seed
npm install
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev            # http://localhost:3000
```

Full walkthrough: [SETUP.md](SETUP.md).

## Seed logins

All passwords: `Passw0rd!2026`

| Role | Email |
| --- | --- |
| Super Admin | `superadmin@corecrm.dev` |
| Admin | `admin@corecrm.dev` |
| Support Manager | `manager@corecrm.dev` |
| Support Agent | `agent@corecrm.dev` |
| Client Admin (ABC Manufacturing) | `john@abc-manufacturing.example.com` |
| Client User (ABC Manufacturing) | `sarah@abc-manufacturing.example.com` |

Organizations: **ABC Manufacturing Pty Ltd**, **XYZ Construction Group**
(the second one proves isolation).

## Scripts

```
npm run dev            npm run build           npm start
npm run lint           npm run typecheck
npm run test           npm run test:watch      npm run test:e2e
npm run db:migrate     npm run db:migrate:deploy
npm run db:seed        npm run db:reset        npm run db:studio
```

## What's implemented

**Ticketing & portal** — invitation-based auth, RBAC + organization isolation,
organizations & onboarding, contacts, users, tickets (create / list / filter /
detail), conversation, internal notes, assignment, status & priority, categories,
attachments (Vercel Blob / local), activity timeline, SLA computation + breach
cron, dashboards + charts, audit log, in-app + email notifications, ⌘K command
palette.

**Email Center** — `EmailProvider` abstraction with Microsoft Graph + Gmail
implementations, OAuth connect flow, account management + org/team scoping,
inbox, send/reply from a support mailbox, threading + idempotent ingestion,
email → ticket, ticket → email, provider webhooks, reconciliation cron.
*Connecting a live mailbox needs a Microsoft/Google OAuth app — see
[docs/EMAIL_INTEGRATION.md](docs/EMAIL_INTEGRATION.md). Everything else works
without it.*

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATABASE.md](docs/DATABASE.md)
- [docs/AUTH.md](docs/AUTH.md)
- [docs/EMAIL_INTEGRATION.md](docs/EMAIL_INTEGRATION.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [context.md](context.md) — the standing project brief

## Verification

```bash
npm run typecheck   # clean
npm run lint        # clean
npm run test        # 24 passing (unit + integration; integration needs a seeded DB)
npm run build       # succeeds; 40 routes
```
