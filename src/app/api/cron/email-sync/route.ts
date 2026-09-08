import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { syncAllActiveAccounts } from "@/server/services/email-account";
import { prisma } from "@/server/db/client";
import { getEmailProvider } from "@/server/providers/email/factory";
import { providerCtxFor } from "@/server/services/email-account";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const header = req.headers.get("authorization");
  return (
    header === `Bearer ${env.CRON_SECRET}` ||
    req.nextUrl.searchParams.get("secret") === env.CRON_SECRET
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Renew webhook subscriptions that expire in the next 6 hours.
  const soon = new Date(Date.now() + 6 * 3600_000);
  const expiring = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      status: "CONNECTED",
      subscriptionId: { not: null },
      subscriptionExpiresAt: { lt: soon },
    },
  });
  for (const acc of expiring) {
    try {
      const { ctx } = await providerCtxFor(acc.id);
      const sub = await getEmailProvider(acc.provider).renewSubscription(
        ctx,
        acc.subscriptionId!,
      );
      await prisma.emailAccount.update({
        where: { id: acc.id },
        data: {
          subscriptionId: sub.subscriptionId,
          subscriptionExpiresAt: sub.expiresAt,
        },
      });
    } catch (e) {
      logger.warn("cron.subscription_renew_failed", { id: acc.id, error: e });
    }
  }

  const results = await syncAllActiveAccounts();
  logger.info("cron.email_sync", { results });
  return Response.json({ ok: true, renewed: expiring.length, results });
}

export const POST = GET;
