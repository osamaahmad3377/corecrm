# Deployment (Vercel)

```
GitHub ──push──▶ Vercel (build + deploy)
                    ├─ Next.js app (serverless functions)
                    ├─ Vercel Cron  → /api/cron/email-sync, /api/cron/sla-check
                    └─ Vercel Blob  (attachments)
External:  PostgreSQL (Neon / Supabase)  ·  Upstash Redis  ·  MS Graph  ·  Gmail API
           Resend (transactional email, optional)
```

The app is serverless-safe: no local filesystem, no long-running processes, no
in-memory persistence, no WebSocket server.

## 1. Database

Create a PostgreSQL 16 database (Neon or Supabase recommended).

- `DATABASE_URL` — pooled connection string (`?sslmode=require`, and for Neon the
  `-pooler` host).
- `DIRECT_URL` — direct (non-pooled) connection, used by `prisma migrate deploy`.

## 2. Vercel project

1. Import the GitHub repo into Vercel.
2. Framework preset: **Next.js** (auto-detected).
3. **Build command** is set in `vercel.json`:
   `prisma generate && prisma migrate deploy && next build`.
4. Add environment variables (Production + Preview) — see `.env.example`:
   - `DATABASE_URL`, `DIRECT_URL`
   - `AUTH_SECRET` (`npx auth secret`), `NEXTAUTH_URL`, `AUTH_URL`, `APP_URL`
     (all the production `https://…` URL)
   - `ENCRYPTION_KEY` (`openssl rand -base64 32`)
   - `CRON_SECRET`, `EMAIL_WEBHOOK_SECRET`
   - `BLOB_READ_WRITE_TOKEN` (create a Blob store in the Vercel dashboard)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - `EMAIL_FROM`, `RESEND_API_KEY` (optional)
   - Microsoft / Google OAuth vars once those apps exist (see
     [EMAIL_INTEGRATION.md](EMAIL_INTEGRATION.md))
5. Deploy.

## 3. Cron

`vercel.json` already declares:

```json
{ "crons": [
  { "path": "/api/cron/email-sync", "schedule": "*/10 * * * *" },
  { "path": "/api/cron/sla-check",  "schedule": "*/5 * * * *" }
]}
```

Vercel Cron calls these with `Authorization: Bearer $CRON_SECRET` automatically.
No extra setup beyond the env var.

## 4. First-run data

`prisma migrate deploy` runs in the build. To create the initial Super Admin,
either:

- run the seed once against production **(creates demo data — usually not what
  you want)**, or
- insert one row manually / with a one-off script:

```sql
-- password must be a bcrypt hash you generate separately
INSERT INTO "User" (id, email, name, "hashedPassword", "isInternal",
                    "internalRole", status, "emailVerified", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'you@company.com', 'Your Name', '<bcrypt-hash>',
        true, 'SUPER_ADMIN', 'ACTIVE', now(), now(), now());
```

Then sign in and onboard organizations from `/admin/organizations`.

Ticket configuration (statuses, priorities, categories, the default SLA policy)
is created by the seed. For a clean production DB, run a **config-only** seed —
comment out the demo org / user / ticket blocks in `prisma/seed.ts`, or run the
full seed on a staging DB and copy the config tables.

## 5. OAuth redirect URIs

Register these on the production domain:

- `https://<domain>/api/emails/accounts/callback/microsoft`
- `https://<domain>/api/emails/accounts/callback/google`

And Auth.js callback (only relevant if you add SSO providers later):
`https://<domain>/api/auth/callback/<provider>`.

## 6. Webhook URLs

- Microsoft Graph subscription notification URL:
  `https://<domain>/api/webhooks/microsoft`
- Gmail Pub/Sub push endpoint: `https://<domain>/api/webhooks/google`

## 7. Domain & headers

Point your domain at Vercel. Security headers (HSTS, CSP, etc.) are emitted by
`next.config.ts` — no CDN config needed.

## Local production check

```bash
docker compose up -d          # local Postgres on :5433
cp .env.example .env          # fill DATABASE_URL etc. (or use the compose values)
npm ci
npm run db:migrate:deploy
npm run db:seed
npm run build && npm start
```
