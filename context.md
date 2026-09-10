# Context — IT Support & Client Portal

> Permanent project context. Read this **first**, before any architectural
> decision or code change. Update it when the architecture changes.
> Last updated: 2026-09-08

---

## 1. What we are building

A **production-grade, single-tenant IT Support & Client Portal** for our IT
services company. Our company operates **one** central support system. Inside it
we manage many **client organizations** (ABC Manufacturing, XYZ Construction,
Example School, …), each with its own users, contacts, tickets, assets, email
conversations, and history.

Two audiences share the one system:

- **Internal staff** — run the helpdesk: onboard clients, triage/assign/resolve
  tickets, manage teams & SLAs, connect support mailboxes (Microsoft 365 /
  Gmail), read/reply to email, convert email ↔ ticket.
- **Client users** — log into a separate portal, raise and track tickets, attach
  files, and talk to support.

Feel/polish reference (inspiration, never copied): Linear, Stripe, Intercom,
Zendesk, Microsoft, Apple.

---

## 2. Single-tenant — the core architectural principle

This is **NOT a multi-tenant SaaS platform**. The application belongs to our
company. There is:

- **NO** `Tenant` table, **NO** `tenantId`
- **NO** tenant switching, registration, billing, or subscription system
- **NO** per-client database or per-client app instance
- **ONE** Next.js application, **ONE** PostgreSQL database

```
Our Company  (the operator — not modeled as a tenant)
   └── Client Organization   (normal client records)
         └── Contacts / Users
               └── Tickets
                     └── Ticket Messages
                           └── Attachments
                     └── Emails → Email Threads
                     └── Activities
```

**But organization isolation is still mandatory.** The **Organization** is the
security boundary for client data. `john@abc.com` (ABC Manufacturing) must never
reach XYZ Construction's tickets, contacts, assets, or emails.

- Authorization is enforced **server-side**, in the service layer.
- The server derives the acting user's organization from the **authenticated
  session**, never from the browser.
- Never trust client-supplied `organizationId`, `userId`, `role`, `ticketId`,
  `emailAccountId` — always resolve and validate against session + database.
- Frontend filtering is never the control.

---

## 3. Tech stack (locked)

| Layer | Choice |
| --- | --- |
| Framework | Next.js (latest stable, App Router) + React + TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui + Lucide icons |
| Data layer | Server Actions + Route Handlers (`/api/*`) |
| DB | PostgreSQL (Neon / Supabase / Vercel-compatible) — **never SQLite in prod** |
| ORM | Prisma + Prisma Migrate |
| Auth | Auth.js (NextAuth) — Credentials + invitation flow; SSO-ready |
| Validation | Zod (shared schemas, client + server) |
| Forms | React Hook Form + Zod resolver |
| Email APIs | `EmailProvider` abstraction → Microsoft Graph, Gmail API |
| Transactional email | React Email templates + provider send |
| File storage | Vercel Blob (behind a `StorageProvider` interface) |
| Charts | Recharts |
| Background work | Vercel Cron + provider webhooks (**no long-running workers**) |
| Tests | Vitest (unit/integration) + Playwright (e2e) |
| Rate limiting | Upstash Redis (or DB-backed fallback) |

---

## 4. Architecture overview

```
Browser (Admin app / Client portal)
        │  HTTPS, secure session cookie
        ▼
Next.js on Vercel
  ├── (admin) route group      internal staff UI
  ├── (portal) route group     client UI
  ├── (auth) route group       login / invite / reset / verify
  ├── /api route handlers      REST-ish endpoints + webhooks + cron
  └── server/                  business logic (framework-agnostic)
        ├── services/          ticket, organization, email, notification, audit, sla, invitation
        ├── providers/email/   EmailProvider interface + Graph + Gmail impls
        ├── auth/              session, RBAC, org-access guard
        ├── db/                Prisma client + repositories (org-scoped)
        └── storage/           StorageProvider interface + Vercel Blob impl
        ▼
External:  PostgreSQL   •   Vercel Blob   •   MS Graph API   •   Gmail API
           Upstash Redis (rate limit)     •   Google Pub/Sub (Gmail watch)
```

**Layering rule:** UI components never import Prisma or provider SDKs directly.
Flow is always `UI → server action / route handler → service → repository/provider`.
Every service call receives an `AuthContext` (who is acting, role, organization
access) and enforces authorization + organization scoping itself.

### Directory structure

```
src/
  app/
    (auth)/        login, invite/[token], forgot-password, reset-password, verify-email
    (admin)/       dashboard, tickets, organizations, contacts, emails,
                   assets, reports, team, settings
    (portal)/      dashboard, tickets, organization, users, profile, notifications
    api/           tickets, organizations, users, contacts, assets,
                   emails/{accounts,messages,send,sync},
                   webhooks/{microsoft,google}, cron/{email-sync,sla-check},
                   notifications, search, upload, files/[id]
  components/      design-system primitives (Button, Input, DataTable, ...)
  features/        feature-scoped UI (ticket-conversation, email-inbox, ...)
  lib/             utils, formatting, timezone, constants, design tokens
  server/
    services/      ticketService, organizationService, emailService,
                   notificationService, auditService, slaService, invitationService
    providers/
      email/       EmailProvider.ts, MicrosoftGraphProvider.ts, GmailProvider.ts,
                   factory.ts, types.ts
    auth/          config.ts, rbac.ts, permissions.ts, org-access.ts, session.ts
    db/            client.ts, repositories/*
    storage/       StorageProvider.ts, VercelBlobProvider.ts
    email-templates/  React Email components + render helpers
    notifications/    channel interface, EmailChannel, InAppChannel
  types/           shared domain types
  validators/      Zod schemas (one file per domain)
prisma/            schema.prisma, migrations/, seed.ts
docs/              ARCHITECTURE.md, DATABASE.md, AUTH.md,
                   EMAIL_INTEGRATION.md, DEPLOYMENT.md, SECURITY.md
tests/             unit/, integration/, e2e/
```

Keep separate: UI · business logic · database · authentication · authorization ·
email providers · notifications. No business logic inside React components.

---

## 5. Domain model (ERD plan)

UUID primary keys everywhere (`id`). `createdAt` / `updatedAt` on all tables.
Human-facing identifiers (`ticketNumber`) are separate columns.
**No `Tenant` table. No `tenantId`.**

### Identity & organizations

- **Organization** — one client company. name, legalName, website, industry,
  address, city, state, country, postalCode, mainPhone, mainEmail, status
  (`ACTIVE|DISABLED`), notes, accountManagerId → User, timestamps.
- **User** — a login. email (unique), name, hashedPassword (nullable until invite
  accepted), emailVerifiedAt, image, isInternal (bool), internalRole (enum, null
  for client users), status, timestamps.
- **OrganizationUser** — links client users to their organization: userId,
  organizationId, role (`CLIENT_ADMIN|CLIENT_USER`), timestamps.
  Unique(userId, organizationId). **A client user belongs to exactly one
  organization** (UI + service enforce this; the join table exists for clean
  modeling and future flexibility, not multi-org switching).
- **Role** — represented as enums, not a runtime-editable table for v1:
  internal `SUPER_ADMIN|ADMIN|SUPPORT_MANAGER|SUPPORT_AGENT`,
  client `CLIENT_ADMIN|CLIENT_USER`.
- **Invitation** — email, organizationId (nullable for internal invites), role,
  token (hashed), expiresAt, acceptedAt, invitedById. Unique active invite per
  email (no duplicate pending invites).
- **Session** — Auth.js session table.
- **Team** — name, description. **TeamMember** — teamId, userId (internal only).
- **Contact** — first/last name, email, phone, position, organizationId, notes.
  **Not a login.** Email resolves inbound email senders.
  Unique(email, organizationId).

### Tickets

- **Ticket** — `ticketNumber` (unique, `TKT-YYYY-NNNNNN`), organizationId,
  requesterContactId, requesterUserId (nullable), subject, description,
  categoryId, subcategoryId, statusId, priorityId, assignedAgentId,
  assignedTeamId, service, assetId, location, contactPhone,
  preferredContactMethod, impact, urgency, source (`PORTAL|EMAIL|INTERNAL`),
  slaPolicyId, firstResponseAt, resolvedAt, closedAt, timestamps.
  Indexes: (organizationId, statusId), (assignedAgentId), (priorityId),
  (createdAt), (ticketNumber).
- **TicketCategory** — name, parentId (self-ref → subcategory), isActive.
- **TicketStatus** — key, label, order, isTerminal, colorToken. Seeded:
  NEW, OPEN, IN_PROGRESS, WAITING_FOR_CLIENT, WAITING_FOR_INTERNAL, RESOLVED,
  CLOSED, CANCELLED. Configurable later.
- **TicketPriority** — key, label, order, colorToken. Seeded: LOW, MEDIUM, HIGH,
  CRITICAL.
- **TicketMessage** — ticketId, authorUserId (nullable), authorContactId
  (nullable), authorType (`CLIENT|AGENT|SYSTEM`), messageType
  (`PUBLIC_REPLY|INTERNAL_NOTE`), body (sanitized HTML), emailMessageId
  (nullable link), timestamps. Index (ticketId, createdAt).
  **INTERNAL_NOTE is never returned to client-facing queries — enforced server-side.**
- **TicketAttachment** — ticketId, ticketMessageId (nullable), fileId → File.
- **TicketAssignment** — ticketId, agentId (nullable), teamId (nullable),
  assignedById, assignedAt, unassignedAt. Full history.
- **TicketActivity** — ticketId, actorUserId (nullable), type, fromValue,
  toValue, metadata (json), createdAt. Rendered as a timeline. Types:
  `CREATED|STATUS_CHANGED|PRIORITY_CHANGED|ASSIGNED|TEAM_ASSIGNED|REASSIGNED|
  PUBLIC_REPLY|INTERNAL_NOTE|ATTACHMENT_ADDED|RESOLVED|REOPENED|CLOSED|
  EMAIL_LINKED|SLA_BREACHED`.
- **Tag** — name, colorToken. **TicketTag** — ticketId, tagId.

### SLA

- **SlaPolicy** — name, organizationId (nullable = global default), isDefault,
  timestamps.
- **SlaTarget** — slaPolicyId, priorityKey, responseMinutes, resolutionMinutes.
  **No hard-coded SLA values in code.** Defaults seeded: Critical 30m, High 2h,
  Medium 8h, Low 24h. Ticket page computes remaining/overdue from
  `firstResponseAt` / `resolvedAt` vs target (elapsed-time for v1; business
  calendar later).

### Email

- **EmailAccount** — displayName, address, provider (`MICROSOFT|GOOGLE`),
  status (`CONNECTED|DISCONNECTED|ERROR`), scopeType
  (`GLOBAL|ORGANIZATION|TEAM`), organizationId (nullable), teamId (nullable),
  externalAccountId, lastSyncedAt, lastError, subscriptionId,
  subscriptionExpiresAt, isActive, timestamps.
- **EmailAccountCredential** — emailAccountId (1:1), encryptedAccessToken,
  encryptedRefreshToken, tokenExpiresAt, scope. **AES-256-GCM at rest**
  (`ENCRYPTION_KEY`). Never serialized to any client, never logged.
- **EmailThread** — emailAccountId, providerThreadId (Graph conversationId /
  Gmail threadId), subject, ticketId (nullable), organizationId (nullable),
  contactId (nullable), lastMessageAt, timestamps.
  Unique(emailAccountId, providerThreadId).
- **EmailMessage** — emailThreadId, emailAccountId, providerMessageId,
  internetMessageId, direction (`INBOUND|OUTBOUND`), fromAddress, fromName,
  toAddresses (json), ccAddresses (json), subject, bodyHtml, bodyText, snippet,
  inReplyTo, references (json), receivedAt, sentAt, isRead, hasAttachments,
  ticketId (nullable), contactId (nullable), organizationId (nullable),
  timestamps. **Unique(emailAccountId, providerMessageId) — idempotency key.**
- **EmailAttachment** — emailMessageId, fileId → File, providerAttachmentId.

### Shared

- **File** — filename, mimeType, size, storageKey, provider (`VERCEL_BLOB`),
  uploadedById, checksum, timestamps. Blobs are private; download always via an
  authz-checked route (`/api/files/[id]`).
- **Asset** — organizationId, name, assetType (`LAPTOP|DESKTOP|SERVER|PRINTER|
  ROUTER|FIREWALL|M365_TENANT|WEBSITE|DOMAIN|OTHER`), serialNumber, model,
  manufacturer, ipAddress, hostname, purchaseDate, warrantyExpiry,
  assignedUserId, notes, timestamps.
- **Notification** — userId, type, title, body, entityType, entityId, readAt,
  channels (json), createdAt. Index (userId, readAt).
- **AuditLog** — actorUserId (nullable), action, entityType, entityId,
  ipAddress, userAgent, metadata (json), createdAt. Append-only.
- **Setting** — scope (`GLOBAL|ORGANIZATION`), organizationId (nullable), key,
  value (json). Company name, logo, timezone, default priority/status, ticket
  numbering config, etc.

### Key relationships

```
Organization 1─* OrganizationUser *─1 User            (client users, one org each)
Organization 1─* Contact
Organization 1─* Ticket *─1 Contact (requester)
Ticket 1─* TicketMessage *─0..1 EmailMessage
Ticket 1─* TicketActivity / TicketAssignment / TicketAttachment / TicketTag
Ticket *─0..1 Asset · *─0..1 SlaPolicy · *─0..1 User (assignedAgent) · Team
EmailAccount 1─1 EmailAccountCredential
EmailAccount 1─* EmailThread 1─* EmailMessage 1─* EmailAttachment
EmailThread *─0..1 Ticket · *─0..1 Organization · *─0..1 Contact
Contact 1─* EmailMessage   (resolved by fromAddress within org scope)
```

---

## 6. RBAC matrix

Internal roles are global (`User.internalRole`). Client roles are per-org
(`OrganizationUser.role`). Every server action resolves `AuthContext` and checks
a permission — UI hiding is never the control.

| Capability | SUPER_ADMIN | ADMIN | SUPPORT_MANAGER | SUPPORT_AGENT | CLIENT_ADMIN | CLIENT_USER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Manage internal users / roles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| System settings (security, numbering) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / edit / disable organizations | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Onboard client users / send invites | ✅ | ✅ | ✅ | ❌ | own org | ❌ |
| Manage categories / priorities / SLA | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage teams | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View all tickets (all orgs) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View own-org tickets | — | — | — | — | ✅ | ✅ (authorized) |
| Create ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assign / reassign tickets | ✅ | ✅ | ✅ | self-claim | ❌ | ❌ |
| Change status / priority | ✅ | ✅ | ✅ | assigned | limited* | ❌ |
| Public reply on ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add / see internal notes | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Connect / disconnect email accounts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View email inbox | ✅ | ✅ | ✅ | ✅ (permitted accounts) | ❌ | ❌ |
| Send email from support mailbox | ✅ | ✅ | ✅ | ✅ (permitted) | ❌ | ❌ |
| Convert email → ticket | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage contacts / assets | ✅ | ✅ | ✅ | view | own org | view |
| View reports / analytics | ✅ | ✅ | ✅ | limited | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

\* CLIENT_ADMIN status changes limited to reopen / confirm-resolved; final rules
in ticket settings.

**Organization-access guard:** for any client request the `organizationId` comes
from `AuthContext` only. Org-scoped repositories require an `orgScope` argument;
a review rule forbids raw `prisma.<model>.findMany` outside repositories.

---

## 7. Route map

### Auth `(auth)`

`/login` · `/forgot-password` · `/reset-password` · `/verify-email` ·
`/invite/[token]`

### Client portal `(portal)` — requires client session

| Route | Purpose |
| --- | --- |
| `/portal` | Client dashboard — open / pending / resolved, recent tickets, recent activity, Create Ticket |
| `/portal/tickets` | Paginated ticket list (own org, authorized) |
| `/portal/tickets/new` | Create ticket (form + attachments) |
| `/portal/tickets/[ticketId]` | Ticket detail — conversation, attachments, SLA, activity (**no internal notes**) |
| `/portal/organization` | Org profile (read) |
| `/portal/users` | Manage org users (CLIENT_ADMIN only) |
| `/portal/notifications` | In-app notifications |
| `/portal/profile` | Profile, password, timezone |

### Admin `(admin)` — requires internal session

| Route | Purpose |
| --- | --- |
| `/admin` | Internal dashboard + charts |
| `/admin/tickets` | All tickets; filters: All / My / Unassigned / Critical / SLA Breached |
| `/admin/tickets/[ticketId]` | Full ticket workspace (conversation, notes, assignment, SLA, org panel) |
| `/admin/organizations` | List / create |
| `/admin/organizations/[organizationId]` | Overview, Contacts, Users, Tickets, Emails, Assets, Activity, Notes |
| `/admin/contacts` | Global contact directory |
| `/admin/emails` | Email center home |
| `/admin/emails/inbox` | 3-pane email client |
| `/admin/emails/accounts` | Connect / manage mailboxes |
| `/admin/emails/sent`, `/admin/emails/conversations` | Sent + thread views |
| `/admin/assets` | Asset inventory |
| `/admin/reports` | Analytics |
| `/admin/team` | Teams + internal users |
| `/admin/settings/{general,tickets,categories,priorities,sla,email,notifications,security}` | Settings |

### API / route handlers

```
GET/POST      /api/tickets
GET/PATCH     /api/tickets/[id]
POST          /api/tickets/[id]/messages
POST          /api/tickets/[id]/assign
POST          /api/tickets/[id]/status
GET/POST      /api/organizations
GET/PATCH     /api/organizations/[id]
POST          /api/organizations/[id]/invite
GET/POST      /api/contacts
GET/POST      /api/assets
GET           /api/emails/messages
GET           /api/emails/messages/[id]
POST          /api/emails/messages/[id]/convert-to-ticket
POST          /api/emails/send
GET/POST      /api/emails/accounts
POST          /api/emails/accounts/[id]/sync
DELETE        /api/emails/accounts/[id]                 (disconnect + revoke)
GET           /api/emails/accounts/connect/[provider]    (OAuth start)
GET           /api/emails/accounts/callback/[provider]    (OAuth callback)
POST          /api/webhooks/microsoft
POST          /api/webhooks/google
POST          /api/cron/email-sync                        (Vercel Cron, CRON_SECRET)
POST          /api/cron/sla-check
GET           /api/search                                 (command palette)
POST          /api/upload                                 (returns File + blob key)
GET           /api/files/[id]                             (authz-checked download)
GET/POST      /api/notifications
```

All inputs validated with Zod. Consistent error envelope
`{ error: { code, message } }` — friendly messages to users, technical detail
logged server-side only.

---

## 8. Email provider architecture

```ts
interface EmailProvider {
  readonly kind: 'MICROSOFT' | 'GOOGLE';
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<ProviderTokens>;
  refreshToken(refreshToken: string): Promise<ProviderTokens>;
  revoke(tokens: ProviderTokens): Promise<void>;

  getAccountInfo(ctx: ProviderCtx): Promise<{ address: string; externalId: string }>;
  syncMessages(ctx: ProviderCtx, opts: SyncOptions): Promise<SyncResult>;   // delta/incremental
  getMessage(ctx: ProviderCtx, id: string): Promise<NormalizedMessage>;
  getThread(ctx: ProviderCtx, threadId: string): Promise<NormalizedMessage[]>;
  sendMessage(ctx: ProviderCtx, msg: OutboundMessage): Promise<NormalizedMessage>;
  replyToMessage(ctx: ProviderCtx, providerMessageId: string, msg: OutboundMessage): Promise<NormalizedMessage>;
  downloadAttachment(ctx: ProviderCtx, msgId: string, attId: string): Promise<Buffer>;

  createSubscription(ctx: ProviderCtx, notifyUrl: string): Promise<Subscription>;
  renewSubscription(ctx: ProviderCtx, subscriptionId: string): Promise<Subscription>;
  deleteSubscription(ctx: ProviderCtx, subscriptionId: string): Promise<void>;
  verifyWebhook(req: Request): Promise<WebhookEvent[]>;
}
```

- `ProviderCtx` carries decrypted tokens + a `TokenStore` callback so refreshed
  tokens persist transparently.
- `NormalizedMessage` is the single internal shape — the app never sees raw Graph
  or Gmail payloads.
- **Implementations:** `MicrosoftGraphProvider` (Graph API, delta queries, change
  notifications, `conversationId`), `GmailProvider` (Gmail API, history API for
  delta, `watch` + Pub/Sub push, `threadId`). Factory:
  `getEmailProvider(account.provider)`.
- Future (IMAP, Zoho, Exchange, …) = new class, no app changes.

### Threading, sender resolution & idempotency

- Inbound message → resolve `EmailThread` by `(emailAccountId, providerThreadId)`;
  create if absent.
- If the thread has a `ticketId`, attach `EmailMessage` to that ticket + add a
  `TicketMessage` (PUBLIC_REPLY, authorType CLIENT) + activity `EMAIL_LINKED`.
- Else try to match an existing ticket via `In-Reply-To` / `References` headers or
  a `TKT-YYYY-NNNNNN` in the subject.
- Resolve sender to a `Contact` by `fromAddress` within the account's org scope →
  derive organization. Unknown sender → "Unknown Contact"; admin creates/links.
- **Dedup:** `Unique(emailAccountId, providerMessageId)` — upsert on that key.
  Webhook + cron + manual sync all converge idempotently.

### Sync on Vercel (serverless — no permanent background worker)

- **Primary:** provider webhooks → `/api/webhooks/{microsoft,google}` fetch the
  changed message IDs and persist.
- **Reconciliation / renewal:** `/api/cron/email-sync` (Vercel Cron, ~10 min)
  renews expiring subscriptions and does a delta pass per active account.
- Every invocation is short, idempotent, retryable, logged, fault-tolerant.

### Webhook security

- Microsoft: `validationToken` handshake; verify `clientState` secret; check
  `subscriptionId` is ours.
- Google: verify Pub/Sub OIDC JWT (audience), confirm topic, map `emailAddress`
  to a known account.
- Both: replay-safe (idempotent upserts); failures → `AuditLog` +
  `EmailAccount.lastError`; return 2xx quickly once accepted.

### Email account permissions & mapping

- Only ADMIN / SUPER_ADMIN connect, disconnect, or reconfigure accounts.
- Agents use only permitted accounts.
- `scopeType`: `GLOBAL` · `ORGANIZATION` (e.g. `abc-support@company.com` → ABC) ·
  `TEAM`. Enables future routing/automation.

---

## 9. Auth architecture

- **Auth.js (NextAuth)** — Credentials provider (email + password, argon2/bcrypt),
  database sessions, secure httpOnly SameSite cookies.
- **Invitation onboarding:** admin creates `User` + `Invitation` (hashed token,
  expiry) → invite email → `/invite/[token]` → user sets password →
  `emailVerifiedAt` set → invite marked accepted. **No admin-set passwords ever.**
- **Password reset / email verification:** same hashed-token pattern.
- **AuthContext** (per request):
  `{ userId, isInternal, internalRole?, organization?: {orgId, role}, teamIds }`.
- **Guards:** `requireInternal(minRole)`, `requireOrgAccess(orgId)`,
  `can(permission, resource)` — used in every server action / route handler.
- **SSO-ready:** provider list is extensible; `User` supports linked accounts
  later (Entra ID, Google Workspace, SAML/OIDC) with no schema rewrite.
- Rate limiting + brute-force lockout on login / invite / reset endpoints.

---

## 10. Security architecture (see docs/SECURITY.md)

| Concern | Control |
| --- | --- |
| AuthZ | Server-side on every action; checks in services, not UI |
| Organization isolation | `organizationId` from session only; repository `orgScope` required; cross-org access → 403 / not-found |
| Injection | Prisma parameterized queries; no raw SQL without review |
| XSS | Sanitize rich text (ticket messages, email bodies) with allowlist; render email HTML in sandboxed iframe |
| CSRF | Auth.js CSRF tokens; server actions same-origin; `state` param on OAuth |
| Secrets | Env vars only; never in client bundle; `EmailAccountCredential` AES-256-GCM with `ENCRYPTION_KEY` |
| OAuth tokens | Never returned via API, never logged, never sent to client JS |
| File upload | MIME + extension allowlist, size cap, checksum, private blobs, authz'd download, virus-scan hook point |
| Transport / headers | HTTPS only; HSTS + CSP + X-Frame-Options etc. via middleware / `next.config` |
| Cookies | httpOnly, Secure, SameSite=Lax |
| Rate limiting | Auth endpoints, upload, search, email send |
| Audit | `AuditLog` for all sensitive actions |
| Error handling | Friendly user messages; details logged server-side; error boundaries + loading/empty/retry states |
| Never exposed to client | password hashes, OAuth client secrets, refresh tokens, encryption key, DB creds |

**Never trust from the browser:** `organizationId`, `userId`, `role`, `ticketId`,
`emailAccountId`.

---

## 11. Vercel deployment architecture (see docs/DEPLOYMENT.md)

```
GitHub repo ──push──▶ Vercel (build + deploy, prisma migrate deploy)
                          ├─ Next.js app (serverless / edge functions)
                          ├─ Vercel Cron → /api/cron/email-sync, /api/cron/sla-check
                          └─ Vercel Blob (object storage)
External:  PostgreSQL (Neon/Supabase — pooled + direct URL for migrations)
           Upstash Redis (rate limiting)
           Microsoft Graph API + Azure AD app (OAuth + webhooks)
           Gmail API + Google Cloud project (OAuth + Pub/Sub topic/push sub)
           Transactional email provider (or send via connected mailbox)
```

Must be serverless-compatible: **no** local filesystem, SQLite, long-running
processes, in-memory persistent state, or permanent WebSocket server. OAuth
redirect URIs + webhook URLs use the production domain — no localhost in prod.

### Environment variables (`.env.example`)

```
DATABASE_URL=
DIRECT_URL=
AUTH_SECRET=
NEXTAUTH_URL=
ENCRYPTION_KEY=                # 32-byte base64, token encryption
BLOB_READ_WRITE_TOKEN=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=          # or "common"
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_PUBSUB_TOPIC=
GOOGLE_PUBSUB_VERIFICATION_AUDIENCE=
EMAIL_WEBHOOK_SECRET=         # clientState / shared secret
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=              # optional if sending via mailbox
APP_URL=
```

Never commit real secrets. Never put secrets in frontend code.

---

## 12. Design system

- **Tokens** in one place (`lib/design-tokens.ts` + Tailwind theme / CSS vars):
  color, spacing, radius, typography, elevation, status colors, priority colors.
  **No hard-coded hex in components.**
- Theme-aware (light/dark), WCAG AA contrast, keyboard nav, focus rings,
  semantic HTML, labeled forms.
- **Primitives:** Button, Input, Textarea, Select, Combobox, Dialog, Drawer,
  Dropdown, Badge, Avatar, Table, DataTable, Tabs, Card, Toast, Tooltip,
  Breadcrumb, CommandMenu (⌘K), Pagination, FileUploader, RichTextEditor.
- **Domain badges:** TicketStatusBadge, PriorityBadge, UserAvatar,
  OrganizationBadge, EmailAccountBadge.
- **States everywhere:** skeleton loading, empty, error, retry.
- **Responsive (mobile first-class):** sidebar → drawer; ticket conversation →
  chat layout; email inbox → Inbox ▸ Message ▸ Back stack; DataTables → card
  lists.
- Avoid: clutter, excessive gradients/shadows, huge cards, generic
  Bootstrap/old-enterprise look.

---

## 13. Notifications

`notificationService` with intent methods: `notifyTicketCreated`,
`notifyTicketAssigned`, `notifyClientReply`, `notifyAgentReply`,
`notifyTicketResolved`, `notifyStatusChanged`, `notifyEmailAccountFailure`.

Channel interface → `InAppChannel` (writes `Notification`) + `EmailChannel`
(React Email template → provider send). SMS / Push / WhatsApp = future channels,
no rewrite. Recipient resolution respects organization scope and role (clients
only get their own tickets).

## 14. Email templates (React Email)

Client Invitation · Ticket Created · Ticket Assigned · Agent Reply · Client
Reply · Ticket Resolved · Password Reset · Email Account Connection Failure.
Shared layout (logo, footer, button).

---

## 15. Testing plan

- **Unit (Vitest):** ticket number generation, ticket creation service, RBAC
  `can()` matrix, org-access guard, ticket assignment, email threading/matching,
  email-account permission checks, token encryption round-trip, SLA calc.
- **Integration:** client creates ticket → agent replies → client replies;
  admin creates org + invites user; **client A cannot read client B's ticket
  (expect 403)**; inbound email becomes / attaches to a ticket; duplicate
  `providerMessageId` does not create a second `EmailMessage`; file access authz.
- **E2E (Playwright):** the critical flow — client login → create ticket →
  agent sees it → agent replies → client sees reply → agent resolves → client
  sees resolution. Plus invite acceptance and ⌘K search.

---

## 16. Seed data (`prisma/seed.ts`)

- Statuses, priorities, default categories/subcategories, default global
  `SlaPolicy` + targets, tags.
- Org: **ABC Manufacturing Pty Ltd** + contacts (John Smith, Sarah Jones,
  David Brown) + sample assets.
- Users: Super Admin, Support Manager, Support Agent, Client Admin (John),
  Client User (Sarah) — dev passwords, clearly marked dev-only.
- ~6–10 sample tickets across statuses/priorities with conversations + activity.
- **No fake OAuth credentials / email accounts.**

---

## 17. npm scripts

```
dev · build · start · lint · typecheck
test · test:watch · test:e2e
db:migrate · db:migrate:deploy · db:seed · db:reset · db:studio
```

---

## 18. Build phases (architecture must support all of them from the start)

**Phase 1 — Foundation**
Next.js + TS + Tailwind + shadcn/ui · PostgreSQL + Prisma schema + migrations +
seed · Auth.js + invitation flow · RBAC + org-access guard · design-system
primitives · admin + portal shells/nav · Organizations CRUD + onboarding ·
Contacts · docs/* · `.env.example` · README / SETUP.

**Phase 2 — Ticketing**
Ticket creation · list · detail · conversation · internal notes · assignments ·
status · priority · categories · attachments (Vercel Blob) · activity timeline ·
client portal dashboards · audit logging · command palette (tickets / orgs /
contacts).

**Phase 3 — Email Center**
`EmailProvider` interface + factory · Microsoft Graph OAuth + provider impl ·
Gmail OAuth + provider impl · `EmailAccount` management UI · inbox (3-pane +
responsive) · email detail · send / reply from mailbox · threading + dedup ·
attachments · email → ticket · ticket → email · webhooks (MS + Google) · cron
sync/renewal · email search.

**Phase 4 — Service Management**
SLA computation + display + breach cron + `SLA Breached` filter · notification
email channel + templates · teams · assets full UI · reports/analytics charts ·
audit log viewer · global search across all entities · email account →
org/team mapping.

**Phase 5 — Automation (only when requested)**
Email automation · ticket routing · auto-assignment · AI classification · AI
summaries · suggested replies. Schema + service hook points prepared now; rules
engine later.

**Future (do not build unless asked):** knowledge base, CSAT, asset discovery /
RMM, M365 management, network monitoring, WhatsApp / SMS, mobile apps, SSO,
advanced reports, billing.

---

## 18a. Requirements delta (2026-09-08 client answers)

- **Three portals, not two.** Support Agents get a dedicated minimal
  **`/employee`** portal (My Tasks + task detail + notifications + profile);
  Managers/Admins use **`/admin`**; clients use **`/portal`**. Middleware routes
  each role to its home. Admins/Managers may also open `/employee`.
- **Admin → client portal** via **"View as client"** on an organization
  (signed short-lived cookie, `requirePortalAuth` returns a scoped
  `CLIENT_USER` context, banner + exit, audit-logged). No global `/portal`
  access for staff.
- **Hard delete organization** — typed-name confirmation; cascades every
  contact / ticket / conversation / attachment / email thread and removes
  client users that belonged only to that org. "Disable" is still the softer
  option.
- **Ticket deadlines** — two fields:
  - `requestedDueAt` — the client's "needed by" date, set at ticket creation and
    editable by the client on their open ticket (non-binding request).
  - `dueAt` — the committed deadline. **Only Admin / Support Manager** may set or
    change it (`ticket.setDueDate`); Support Agents see it read-only.
  Overdue `dueAt` drives the employee "overdue / due today" stats and shows red.
- **Employee portal shows closed work too** — `/employee` has a "Closed &
  resolved" stat + tab; `/employee/tasks` tabs are My open work · Assigned to me
  · Team queue · Closed & resolved. The default list is still the open queue.
  `myScopeWhere` = assigned to me OR to any of my teams (whole group queue).
- **Email triage** — inbox actions per unlinked inbound email:
  **Create ticket** · **Mark as info** · **Ignore** (+ undo), with filter tabs
  (Active / Needs triage / Info / Ignored / All). Counts feed the dashboard
  "how requests reached us" breakdown.
- **DB-backed email templates** — `EmailTemplate` rows (8 built-ins seeded,
  `isSystem`), edited/reset/created under **Settings → Templates**
  (`emailTemplate.manage`). `renderTemplate(key, vars)` does `{{var}}`
  substitution + shared layout; falls back to the registry default.
- **Team management** — create / edit / delete teams, `Team.status`
  (ACTIVE/INACTIVE), add/remove members, all on `/admin/team`.
- **Admin-initiated password reset** — "Send reset" on any user row
  (`user.resetPassword`) triggers the normal reset email.
- **Onboarding schema** — Organization gains `businessHours`, `location`,
  `sharepointUrl`, `onboardingDate` (today by default); Client-KPI view
  (name / org / onboarding date / raised / closed / SharePoint / website) on
  the org page and in Reports.
- **Analytics** — dashboard + reports show client / employee / group counts,
  active vs closed tickets, and the request-channel breakdown.
- **Deadline alerts** — `dueAt` overdue/approaching shows a card on the admin
  and employee dashboards; the `sla-check` cron sends in-app + email alerts
  (≤4h out, or passed) to the assignee, team and managers.
- **Email automation engine** (`AutomationRule` + `AutomationJob`) — an admin
  binds an editable template to a **trigger** ("module") with an audience and a
  delay/threshold. `Settings → Automations` lists, toggles, edits and creates
  rules and shows an activity log; **Run now** forces a pass.
  - **Event triggers** (fired from services): `CLIENT_ONBOARDED`,
    `CLIENT_USER_ACTIVATED`, `TICKET_CREATED`, `TICKET_ASSIGNED`,
    `TICKET_AWAITING_CLIENT`, `TICKET_RESOLVED` (delayed follow-up).
  - **Time-based triggers** (evaluated by `/api/cron/automations`, every 15m):
    `INVITATION_REMINDER`, `TICKET_NO_CLIENT_REPLY`, `TICKET_STALE`,
    `WEEKLY_CLIENT_DIGEST`, `CLIENT_INACTIVE`.
  - Sends are idempotent (`AutomationJob.dedupeKey`), re-checked against current
    state before sending, and retried up to 3× on failure.
  - Seeded system templates: client onboarding welcome, invitation reminder,
    account activated, resolution follow-up, waiting-on-client reminder, stale
    ticket check-in, weekly ticket summary, re-engagement. Admins can also
    create custom templates and point any rule at them.

---

## 19. Definition of Done (per feature)

UI · backend · database integration · Zod validation · server-side authorization
· error handling · loading state · empty state (where relevant) · tests (where
appropriate) · `typecheck` passes · `lint` passes · production `build` passes.
**A visually implemented button is not a completed feature.** If something is not
implemented, say so explicitly.

## 20. Post-implementation checklist

1. `typecheck` clean · 2. `lint` clean · 3. unit + integration tests pass ·
4. `build` succeeds · 5. no console errors · 6. every route in §7 renders or
guards correctly · 7. authorization verified (client cross-org = 403, internal
role gates) · 8. `migrate deploy` + `seed` run clean on a fresh DB ·
9. `vercel.json` (cron) + env docs complete · 10. no placeholder / fake
functionality; unfinished items explicitly listed.

---

## 21. Working rules for Claude Code

1. Read this `context.md` first. 2. Inspect the existing project before changing
it. 3. Don't rewrite working code unnecessarily; follow existing conventions.
4. Keep business logic out of React components. 5. Strict TypeScript. 6. Validate
all external input (Zod). 7. Authorization server-side, always. 8. Never expose
secrets or OAuth tokens. 9. No fake production functionality. 10. Store
timestamps in UTC, display in the user's timezone. 11. Paginate everything large
(25 / 50 / 100; cursor pagination for feeds). 12. After significant changes run
typecheck, lint, tests, and the production build; fix failures. 13. Update
`docs/*` when architecture changes.

**Priorities, in order:** Security → Organization data isolation → Reliability →
Maintainability → Performance → UX → Scalability.
