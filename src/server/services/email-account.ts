import "server-only";
import type { EmailAccount, EmailProviderKind, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { AppError, notFound } from "@/lib/errors";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "./audit";
import { getEmailProvider } from "@/server/providers/email/factory";
import type { ProviderCtx, ProviderTokens } from "@/server/providers/email/types";
import { ingestMessage } from "./email-ingest";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

function redirectUri(kind: EmailProviderKind) {
  return `${env.APP_URL.replace(/\/$/, "")}/api/emails/accounts/callback/${kind.toLowerCase()}`;
}

// --- Connect flow (OAuth) ------------------------------------------------

/** Build the provider authorization URL and a short-lived signed state. */
export async function beginConnect(
  ctx: AuthContext,
  kind: EmailProviderKind,
): Promise<string> {
  const provider = getEmailProvider(kind);
  const state = randomToken(24);
  await prisma.verificationToken.create({
    data: {
      identifier: `email-connect:${ctx.userId}`,
      purpose: `EMAIL_CONNECT_${kind}`,
      tokenHash: sha256(state),
      expires: new Date(Date.now() + 15 * 60_000),
    },
  });
  return provider.getAuthorizationUrl(state, redirectUri(kind));
}

export async function completeConnect(
  ctx: AuthContext,
  kind: EmailProviderKind,
  code: string,
  state: string,
  meta?: Meta,
): Promise<EmailAccount> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: sha256(state) },
  });
  if (
    !record ||
    record.purpose !== `EMAIL_CONNECT_${kind}` ||
    record.identifier !== `email-connect:${ctx.userId}` ||
    record.expires < new Date()
  ) {
    throw new AppError("FORBIDDEN", "This connection request is invalid or expired.");
  }
  await prisma.verificationToken.delete({ where: { tokenHash: sha256(state) } });

  const provider = getEmailProvider(kind);
  const tokens = await provider.exchangeCode(code, redirectUri(kind));
  const info = await provider.getAccountInfo({
    tokens,
    onTokensRefreshed: async () => {},
  });

  if (!info.address) {
    throw new AppError("PROVIDER_ERROR", "Couldn't determine the mailbox address.");
  }

  const account = await prisma.$transaction(async (tx) => {
    const acc = await tx.emailAccount.upsert({
      where: { address: info.address },
      create: {
        address: info.address,
        displayName: info.displayName ?? info.address,
        provider: kind,
        status: "CONNECTED",
        externalAccountId: info.externalId,
        lastSyncedAt: null,
        lastError: null,
      },
      update: {
        provider: kind,
        status: "CONNECTED",
        externalAccountId: info.externalId,
        lastError: null,
      },
    });
    await tx.emailAccountCredential.upsert({
      where: { emailAccountId: acc.id },
      create: {
        emailAccountId: acc.id,
        encryptedAccessToken: encrypt(tokens.accessToken),
        encryptedRefreshToken: encrypt(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
      },
      update: {
        encryptedAccessToken: encrypt(tokens.accessToken),
        encryptedRefreshToken: encrypt(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
      },
    });
    return acc;
  });

  await recordAudit({
    action: "EMAIL_ACCOUNT_CONNECTED",
    entityType: "emailAccount",
    entityId: account.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { address: account.address, provider: kind },
  });

  // Fire a first sync (best effort).
  syncAccount(account.id).catch((e) =>
    logger.error("email.initial_sync_failed", { accountId: account.id, error: e }),
  );

  return account;
}

// --- Provider context --------------------------------------------------

async function providerCtxFor(accountId: string): Promise<{
  account: EmailAccount;
  ctx: ProviderCtx;
}> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    include: { credential: true },
  });
  if (!account || !account.credential) {
    throw notFound("Email account is not connected");
  }
  const tokens: ProviderTokens = {
    accessToken: decrypt(account.credential.encryptedAccessToken),
    refreshToken: decrypt(account.credential.encryptedRefreshToken),
    expiresAt: account.credential.tokenExpiresAt,
    scope: account.credential.scope ?? undefined,
  };
  const ctx: ProviderCtx = {
    tokens,
    onTokensRefreshed: async (t) => {
      await prisma.emailAccountCredential.update({
        where: { emailAccountId: account.id },
        data: {
          encryptedAccessToken: encrypt(t.accessToken),
          encryptedRefreshToken: encrypt(t.refreshToken),
          tokenExpiresAt: t.expiresAt,
        },
      });
    },
  };
  return { account, ctx };
}

// --- Sync -------------------------------------------------------------

export async function syncAccount(accountId: string): Promise<{
  fetched: number;
  created: number;
}> {
  const { account, ctx } = await providerCtxFor(accountId);
  const provider = getEmailProvider(account.provider);

  try {
    const { messages, nextCursor } = await provider.syncMessages(ctx, {
      cursor: account.deltaCursor,
      limit: 25,
    });
    let created = 0;
    for (const m of messages) {
      const res = await ingestMessage(account, m);
      if (res.created) created++;
    }
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        deltaCursor: nextCursor,
        lastSyncedAt: new Date(),
        lastError: null,
        status: "CONNECTED",
      },
    });
    return { fetched: messages.length, created };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { status: "ERROR", lastError: message },
    });
    logger.error("email.sync_failed", { accountId, error: e });
    throw e;
  }
}

export async function syncAllActiveAccounts() {
  const accounts = await prisma.emailAccount.findMany({
    where: { isActive: true, status: { in: ["CONNECTED", "ERROR"] } },
    select: { id: true, address: true },
  });
  const results: Record<string, unknown> = {};
  for (const a of accounts) {
    try {
      results[a.address] = await syncAccount(a.id);
    } catch (e) {
      results[a.address] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return results;
}

// --- Management -------------------------------------------------------

export async function listEmailAccounts() {
  return prisma.emailAccount.findMany({
    orderBy: { displayName: "asc" },
    include: {
      organization: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { messages: true, threads: true } },
    },
  });
}

export async function updateEmailAccount(
  ctx: AuthContext,
  id: string,
  input: {
    displayName?: string;
    scope?: "GLOBAL" | "ORGANIZATION" | "TEAM";
    organizationId?: string | null;
    teamId?: string | null;
    isActive?: boolean;
  },
  meta?: Meta,
) {
  const account = await prisma.emailAccount.findUnique({ where: { id } });
  if (!account) throw notFound("Email account not found");

  const data: Prisma.EmailAccountUpdateInput = {};
  if (input.displayName) data.displayName = input.displayName.trim();
  if (input.scope) data.scope = input.scope;
  if (input.scope === "ORGANIZATION") {
    data.organization = input.organizationId
      ? { connect: { id: input.organizationId } }
      : { disconnect: true };
    data.team = { disconnect: true };
  } else if (input.scope === "TEAM") {
    data.team = input.teamId ? { connect: { id: input.teamId } } : { disconnect: true };
    data.organization = { disconnect: true };
  } else if (input.scope === "GLOBAL") {
    data.organization = { disconnect: true };
    data.team = { disconnect: true };
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;

  await prisma.emailAccount.update({ where: { id }, data });
  await recordAudit({
    action: "EMAIL_ACCOUNT_UPDATED",
    entityType: "emailAccount",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
}

export async function disconnectEmailAccount(
  ctx: AuthContext,
  id: string,
  meta?: Meta,
) {
  const account = await prisma.emailAccount.findUnique({
    where: { id },
    include: { credential: true },
  });
  if (!account) throw notFound("Email account not found");

  if (account.credential) {
    try {
      const { ctx: pctx } = await providerCtxFor(id);
      await getEmailProvider(account.provider).revoke(pctx.tokens);
      if (account.subscriptionId) {
        await getEmailProvider(account.provider)
          .deleteSubscription(pctx, account.subscriptionId)
          .catch(() => undefined);
      }
    } catch (e) {
      logger.warn("email.revoke_failed", { id, error: e });
    }
  }

  await prisma.$transaction([
    prisma.emailAccountCredential.deleteMany({ where: { emailAccountId: id } }),
    prisma.emailAccount.update({
      where: { id },
      data: {
        status: "DISCONNECTED",
        subscriptionId: null,
        subscriptionExpiresAt: null,
        deltaCursor: null,
      },
    }),
  ]);

  await recordAudit({
    action: "EMAIL_ACCOUNT_DISCONNECTED",
    entityType: "emailAccount",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { address: account.address },
  });
}

export { providerCtxFor };
