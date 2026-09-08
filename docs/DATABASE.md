# Database

PostgreSQL 16, accessed through Prisma 6. Schema: `prisma/schema.prisma`.
Migrations: `prisma/migrations/`. Seed: `prisma/seed.ts`.

- All primary keys are UUID `id` (`@default(uuid())`).
- `createdAt` / `updatedAt` on mutable models.
- Human identifiers (`ticketNumber`) are separate columns.
- **No `Tenant` table / `tenantId`.** The `Organization` is the client-data
  boundary, enforced in the service layer.

## Commands

```bash
npm run db:migrate          # prisma migrate dev  (create + apply in dev)
npm run db:migrate:deploy   # prisma migrate deploy (CI / production)
npm run db:seed             # tsx prisma/seed.ts
npm run db:reset            # drop, re-migrate, re-seed  (destructive)
npm run db:studio           # Prisma Studio
```

## Entities

### Identity & organizations

| Model | Purpose / notable fields |
| --- | --- |
| `User` | Login. `email` unique, `hashedPassword` (null until invite accepted), `isInternal`, `internalRole?`, `status` (`INVITED\|ACTIVE\|DISABLED`), `timezone`. |
| `Organization` | One client company. Address block, `status` (`ACTIVE\|DISABLED`), `accountManagerId → User`. |
| `OrganizationUser` | Client user ↔ organization, `role` (`CLIENT_ADMIN\|CLIENT_USER`). `@@unique([userId, organizationId])`. One org per client user (enforced in UI/services). |
| `Invitation` | `tokenHash` unique, `internalRole?` / `clientRole?` + `organizationId?`, `status`, `expiresAt`. One active `PENDING` invite per email (service-enforced). |
| `VerificationToken` | Password-reset / email-verification / email-connect state. `@@unique([identifier, purpose])`. |
| `Account`, `Session` | Auth.js adapter tables — reserved for future OAuth/SSO. Credentials auth uses JWT, so `Session` is currently unused. |
| `Team`, `TeamMember` | Support teams (internal users only). |
| `Contact` | Not a login. `@@unique([organizationId, email])`. Used to resolve inbound email senders. |

### Tickets

| Model | Notes |
| --- | --- |
| `Ticket` | `ticketNumber` unique. FKs: organization, requester `Contact`, `requesterUser?`, status, priority, category/subcategory, `assignedAgent?`, `assignedTeam?`, `slaPolicy?`, `asset?`. SLA fields: `responseDueAt`, `resolutionDueAt`, `firstResponseAt`, `resolvedAt`, `closedAt`, `responseBreached`, `resolutionBreached`. Indexes on `(organizationId, statusId)`, `assignedAgentId`, `priorityId`, `statusId`, `createdAt`, `responseDueAt`, `resolutionDueAt`. |
| `TicketMessage` | `messageType` (`PUBLIC_REPLY\|INTERNAL_NOTE`), `authorType` (`CLIENT\|AGENT\|SYSTEM`), sanitized HTML `body`, optional `emailMessageId` link. `@@index([ticketId, createdAt])`. |
| `TicketAttachment` | Links `Ticket` (and optionally a `TicketMessage`) to a `File`. |
| `TicketAssignment` | Full assignment history (`assignedAt` / `unassignedAt`). |
| `TicketActivity` | Timeline events (`TicketActivityType`). Client viewers never see `INTERNAL_NOTE` / `CATEGORY_CHANGED`. |
| `Tag`, `TicketTag` | Free-form labels. |
| `TicketStatus` | Configurable. `key`, `label`, `order`, `isDefault`, `isTerminal`, `colorToken`. Seeded: NEW, OPEN, IN_PROGRESS, WAITING_FOR_CLIENT, WAITING_FOR_INTERNAL, RESOLVED, CLOSED, CANCELLED. |
| `TicketPriority` | Configurable. Seeded: LOW, MEDIUM (default), HIGH, CRITICAL. |
| `TicketCategory` | Self-referencing (`parentId`) for subcategories. |

### SLA

| Model | Notes |
| --- | --- |
| `SlaPolicy` | `organizationId?` (null = global). `isDefault`. |
| `SlaTarget` | Per-priority `responseMinutes` / `resolutionMinutes`. `@@unique([slaPolicyId, priorityId])`. No hard-coded values in code. |

Seeded default ("Standard SLA"): Critical 30m / 4h · High 2h / 8h ·
Medium 8h / 3d · Low 24h / 5d.

### Email

| Model | Notes |
| --- | --- |
| `EmailAccount` | `address` unique, `provider` (`MICROSOFT\|GOOGLE`), `status`, `scope` (`GLOBAL\|ORGANIZATION\|TEAM`) + optional `organizationId`/`teamId`, `deltaCursor`, `subscriptionId`, `subscriptionExpiresAt`. |
| `EmailAccountCredential` | 1:1. `encryptedAccessToken` / `encryptedRefreshToken` (AES-256-GCM), `tokenExpiresAt`. Never serialized to a client. |
| `EmailThread` | `@@unique([emailAccountId, providerThreadId])`. Optional `ticketId`, `organizationId`, `contactId`. |
| `EmailMessage` | **`@@unique([emailAccountId, providerMessageId])` — idempotency key.** `direction`, from/to/cc, sanitized `bodyHtml`, `inReplyTo`, `references`, `internetMessageId`, optional `ticketId`/`contactId`/`organizationId`. |
| `EmailAttachment` | Links an `EmailMessage` to a `File`. |

### Files, assets, ops

| Model | Notes |
| --- | --- |
| `File` | `storageKey` unique, `provider` (`LOCAL\|VERCEL_BLOB`), `mimeType`, `size`, `checksum`, `uploadedById?`. Served only through `/api/files/[id]` after an authorization check. |
| `Asset` | Per-organization. `assetType` enum, serial/model/manufacturer, IP/hostname, purchase/warranty dates, `assignedUserId?`. |
| `Notification` | `type` (`NotificationType`), `title`, `body`, `entityType`/`entityId`, `linkUrl`, `readAt?`, `channels`. Index `(userId, readAt)`. |
| `AuditLog` | Append-only. `action`, `entityType`, `entityId?`, `actorUserId?`, `ipAddress?`, `userAgent?`, `metadata` (JSON). |
| `Setting` | `scope` (`GLOBAL\|ORGANIZATION`) + optional `organizationId`, `key`, `value` (JSON). `@@unique([scope, organizationId, key])`. |
| `Counter` | Ticket-number sequence (`id = "ticket:<year>"`). |

## Relationship overview

```
Organization 1─* OrganizationUser *─1 User
Organization 1─* Contact 1─* Ticket
Ticket 1─* TicketMessage *─0..1 EmailMessage
Ticket 1─* TicketActivity / TicketAssignment / TicketAttachment / TicketTag
Ticket *─0..1 Asset · SlaPolicy · User(assignedAgent) · Team
EmailAccount 1─1 EmailAccountCredential
EmailAccount 1─* EmailThread 1─* EmailMessage 1─* EmailAttachment
EmailThread *─0..1 Ticket · Organization · Contact
File 1─* TicketAttachment / EmailAttachment
```

## Ticket number generation

`nextTicketNumber(tx)` upserts `Counter { id: "ticket:2026" }` with
`value: { increment: 1 }` **inside the ticket-create transaction**, so numbers
are unique and gap-free under concurrency. `TKT-2026-000001`, `…000002`, …
