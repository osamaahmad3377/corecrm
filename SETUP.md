# Setup

Step-by-step for local development and first production deploy.

## Prerequisites

- Node.js 20+ (tested on 24)
- Docker (for the local database) **or** a PostgreSQL 16 instance
- npm

## 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate`.

## 2. Create the database

**Option A — Docker (recommended for local):**

```bash
docker compose up -d
# Postgres now on localhost:5433, db/user/pass all "corecrm"
```

**Option B — Neon / Supabase / other:** create a database and note its pooled and
direct connection strings.

## 3. Environment variables

```bash
cp .env.example .env
```

Then set:

| Variable | How to get it |
| --- | --- |
| `DATABASE_URL` | Docker default already in `.env.example`; else your pooled URL |
| `DIRECT_URL` | Same as `DATABASE_URL` locally; the non-pooled URL in production |
| `AUTH_SECRET` | `npx auth secret` (or `openssl rand -base64 33`) |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — must decode to exactly 32 bytes |
| `NEXTAUTH_URL` / `AUTH_URL` / `APP_URL` | `http://localhost:3000` locally |
| `EMAIL_WEBHOOK_SECRET`, `CRON_SECRET` | any strong random strings |

Everything else is optional for local dev (email providers, Blob, Upstash,
Resend). Without them: attachments save to `.uploads/`, rate limiting is
in-memory, and transactional emails print to the server log.

## 4. Migrate & seed

```bash
npm run db:migrate      # applies prisma/migrations
npm run db:seed         # ticket config + demo org/users/tickets
```

The seed prints all demo logins (password `Passw0rd!2026`).

## 5. Run

```bash
npm run dev
```

Open http://localhost:3000 and sign in as `agent@corecrm.dev` (admin console) or
`sarah@abc-manufacturing.example.com` (client portal).

## 6. Verify

```bash
npm run typecheck
npm run lint
npm run test            # integration tests need step 4 done first
npm run build
```

## 7. Microsoft 365 OAuth app (for the Email Center)

1. Azure Portal → **App registrations** → **New registration**.
2. **Redirect URI** (Web): `http://localhost:3000/api/emails/accounts/callback/microsoft`
   (add the production URL too when you deploy).
3. **API permissions** → Microsoft Graph → Delegated: `offline_access`, `openid`,
   `email`, `profile`, `Mail.ReadWrite`, `Mail.Send`, `User.Read` → **Grant admin
   consent**.
4. **Certificates & secrets** → **New client secret**.
5. Put `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
   (your tenant GUID, or `common`) in `.env` and restart `npm run dev`.
6. In the app: **Email Center → Accounts → Connect Microsoft 365**.

## 8. Google Workspace OAuth app (for the Email Center)

1. Google Cloud Console → **APIs & Services** → enable **Gmail API**.
2. **OAuth consent screen** → Internal → scopes: `openid`, `email`, `profile`,
   `https://www.googleapis.com/auth/gmail.modify`,
   `https://www.googleapis.com/auth/gmail.send`.
3. **Credentials** → **Create OAuth client ID** → Web application.
   Redirect URI: `http://localhost:3000/api/emails/accounts/callback/google`.
4. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `.env`.
5. *(Optional, for push instead of polling)* create a Pub/Sub topic + push
   subscription to `/api/webhooks/google`; set `GOOGLE_PUBSUB_TOPIC` and
   `GOOGLE_PUBSUB_VERIFICATION_AUDIENCE`.
6. In the app: **Email Center → Accounts → Connect Google Workspace**.

## 9. Configure callback & webhook URLs

Local:

- MS callback: `http://localhost:3000/api/emails/accounts/callback/microsoft`
- Google callback: `http://localhost:3000/api/emails/accounts/callback/google`
- Graph notification URL / Gmail push endpoint need a **public** URL — use a
  tunnel (e.g. `cloudflared`, `ngrok`) pointing at `localhost:3000` while
  developing webhooks, or just rely on the cron sync locally.

Production: replace `http://localhost:3000` with your domain everywhere.

## 10. Deploy to Vercel

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short: import the repo, add the
env vars, deploy. `vercel.json` handles the build command and cron schedules.
