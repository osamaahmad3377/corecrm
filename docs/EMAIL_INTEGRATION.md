# Email Integration

The Email Center connects support mailboxes over **OAuth 2.0** and turns email
into tickets (and back). **No mailbox password is ever entered or stored.**

## Provider abstraction

`src/server/providers/email/types.ts` defines `EmailProvider`. Implementations:
`microsoft.ts` (Microsoft Graph), `gmail.ts` (Gmail REST). `factory.ts` maps
`EmailProviderKind → EmailProvider`. Adding IMAP / Zoho / Exchange later = a new
class in the registry; nothing else changes.

```ts
interface EmailProvider {
  kind: "MICROSOFT" | "GOOGLE";
  getAuthorizationUrl(state, redirectUri): string;
  exchangeCode(code, redirectUri): Promise<ProviderTokens>;
  refreshToken(refreshToken): Promise<ProviderTokens>;
  revoke(tokens): Promise<void>;
  getAccountInfo(ctx): Promise<{ address; externalId; displayName? }>;
  syncMessages(ctx, { cursor, limit }): Promise<{ messages: NormalizedMessage[]; nextCursor }>;
  getMessage(ctx, id): Promise<NormalizedMessage>;
  getThread(ctx, threadId): Promise<NormalizedMessage[]>;
  sendMessage(ctx, OutboundMessage): Promise<NormalizedMessage>;
  createSubscription / renewSubscription / deleteSubscription(...);
}
```

`ProviderCtx` carries decrypted tokens plus an `onTokensRefreshed` callback the
provider calls after a refresh so rotated tokens are persisted transparently.
The rest of the app only ever sees `NormalizedMessage` — never a raw Graph or
Gmail payload.

## Connect flow

1. Admin (`email.account.manage`) clicks **Connect Microsoft 365 / Google
   Workspace** → `GET /api/emails/accounts/connect/<provider>`.
2. A signed `state` is stored as a `VerificationToken` (15-min expiry);
   the provider consent URL is returned as a redirect.
3. Provider redirects to `GET /api/emails/accounts/callback/<provider>`.
4. `completeConnect()` validates `state`, exchanges the code, reads the mailbox
   address, and upserts `EmailAccount` + `EmailAccountCredential` (tokens
   **AES-256-GCM encrypted** with `ENCRYPTION_KEY`).
5. A first sync is fired best-effort.

Disconnecting deletes + revokes tokens and drops any webhook subscription;
historic `EmailMessage` rows stay linked to their tickets.

## Sync (serverless-safe)

- **Webhooks (primary)**
  - Microsoft: `POST /api/webhooks/microsoft`. Answers the `validationToken`
    handshake; verifies `clientState === EMAIL_WEBHOOK_SECRET`; fetches the
    changed message and ingests it.
  - Gmail: `POST /api/webhooks/google`. Verifies the Pub/Sub OIDC token audience
    (`GOOGLE_PUBSUB_VERIFICATION_AUDIENCE`); decodes the mailbox address; triggers
    a delta sync for that account.
- **Cron (reconciliation + renewal)** — `GET/POST /api/cron/email-sync` every
  10 min (see `vercel.json`). Renews subscriptions expiring within 6h and runs a
  bounded delta sync (≤ 25 messages/account/run). Requires
  `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically).

Every path calls `ingestMessage()`, which is **idempotent** on
`@@unique([emailAccountId, providerMessageId])`.

## Ingestion & threading (`email-ingest.ts`)

For each message:
1. **Dedup** on the provider message id.
2. **Resolve sender** — match `fromAddress` to a `Contact` → derive
   `organizationId`. Unknown sender → stored as "Unknown Contact".
3. **Thread** — upsert `EmailThread` on `(emailAccountId, providerThreadId)`.
4. **Link to a ticket** — if the thread already has one; else match a
   `TKT-YYYY-NNNNNN` in the subject; else match `In-Reply-To` / `References`
   against a stored `internetMessageId` that has a ticket.
5. **Store** the sanitized `EmailMessage`.
6. If linked, mirror inbound client email into the ticket as a `PUBLIC_REPLY`
   `TicketMessage` + an `EMAIL_LINKED` activity, and audit `EMAIL_RECEIVED`.

## Email → Ticket

In the inbox, an unlinked inbound message shows **Create ticket**
(`convertEmailToTicket()`). It requires the sender to resolve to a contact under
an organization; it then creates an `EMAIL`-source ticket pre-filled with the
subject/body and links the thread.

## Ticket → Email

On an admin ticket, **Email client** (`EmailClientDialog`) sends from a connected
mailbox via `sendSupportEmail()`. The outbound message is stored, linked to the
thread + ticket, and added to the conversation as an agent `PUBLIC_REPLY`.
`EMAIL_SENT` is audited.

## Account → organization / team mapping

`EmailAccount.scope` = `GLOBAL | ORGANIZATION | TEAM`. When set to
`ORGANIZATION`, ingestion prefers that org for sender resolution. This is the
hook for future routing/automation rules.

## Configuration

### Microsoft 365 (Azure AD app)

1. Azure Portal → App registrations → New registration.
2. Redirect URI (Web): `${APP_URL}/api/emails/accounts/callback/microsoft`.
3. API permissions (delegated): `offline_access`, `openid`, `email`, `profile`,
   `Mail.ReadWrite`, `Mail.Send`, `User.Read`. Grant admin consent.
4. Certificates & secrets → new client secret.
5. Env: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`,
   `MICROSOFT_TENANT_ID` (your tenant GUID, or `common` for multi-tenant).
6. Webhooks: Graph will `POST` the notification URL during subscription
   creation and expects the `validationToken` echoed within 10s — the route
   handles this. Subscriptions last 24h and are auto-renewed by the cron.

### Google Workspace (Google Cloud project)

1. Cloud Console → APIs & Services → enable **Gmail API**.
2. OAuth consent screen (Internal for Workspace); scopes: `openid`, `email`,
   `profile`, `gmail.modify`, `gmail.send`.
3. Credentials → OAuth client ID (Web). Redirect URI:
   `${APP_URL}/api/emails/accounts/callback/google`.
4. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. Push (optional but recommended): create a Pub/Sub topic, grant
   `gmail-api-push@system.gserviceaccount.com` the Publisher role, add a push
   subscription to `${APP_URL}/api/webhooks/google` with an OIDC service account.
   Env: `GOOGLE_PUBSUB_TOPIC` (`projects/<p>/topics/<t>`),
   `GOOGLE_PUBSUB_VERIFICATION_AUDIENCE` (your push endpoint URL).
   Without Pub/Sub the cron still syncs Gmail on a schedule.

### Shared

- `EMAIL_WEBHOOK_SECRET` — echoed as Graph `clientState`; verify on inbound.
- `CRON_SECRET` — bearer secret for `/api/cron/*`.
- `ENCRYPTION_KEY` — 32-byte base64; encrypts stored tokens.

If provider credentials are absent, the accounts page shows a clear
"not configured" notice and the connect buttons are disabled — the rest of the
app is unaffected.
