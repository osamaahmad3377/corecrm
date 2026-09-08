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

## Three portals

| Portal | Who | What |
| --- | --- | --- |
| `/admin` | Super Admin · Admin · Support Manager | Everything: onboarding, assignment, teams, SLA, email center, settings, analytics |
| `/employee` | Support Agent (Managers/Admins too) | Focused "My Tasks" queue + ticket conversations + notifications |
| `/portal` | Client users | Raise / track tickets, talk to support, org & users |

Admins/Managers can open a client's portal read-as-them via **View as client**
on the organization page.

## What's implemented

**Ticketing & portals** — invitation auth + password reset (self-service &
admin-initiated), RBAC + organization isolation, organizations & onboarding
(business hours, location, SharePoint link, onboarding date), contacts, users,
teams (create / members / active-inactive), tickets (create / list / filter /
detail), conversation, internal notes, assignment to agent **or** team, status &
priority, **manual deadlines**, categories, attachments (Vercel Blob / local),
activity timeline, SLA computation + breach cron, dashboards + charts (clients /
employees / groups / active / closed + request-channel breakdown), Client KPI
report, audit log, in-app + email notifications, ⌘K command palette.

**Email Center** — `EmailProvider` abstraction with Microsoft Graph + Gmail
implementations, OAuth connect flow, account management + org/team scoping,
inbox with **triage** (create ticket · mark as info · ignore), send/reply from a
support mailbox, threading + idempotent ingestion, email → ticket, ticket →
email, provider webhooks, reconciliation cron.
*Connecting a live mailbox needs a Microsoft/Google OAuth app — see
[docs/EMAIL_INTEGRATION.md](docs/EMAIL_INTEGRATION.md). Everything else works
without it.*

**Settings** — company/general, ticket categories & priorities, SLA policies,
**editable email templates** (8 built-ins + custom), email accounts, security +
audit log, profile.

**Danger zone** — hard-delete an organization (typed-name confirm, cascades all
its data).

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
