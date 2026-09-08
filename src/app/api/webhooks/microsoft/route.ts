import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db/client";
import { getEmailProvider } from "@/server/providers/email/factory";
import { providerCtxFor } from "@/server/services/email-account";
import { ingestMessage } from "@/server/services/email-ingest";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Microsoft Graph change notifications.
 * - Responds to the subscription validation handshake.
 * - Verifies clientState against EMAIL_WEBHOOK_SECRET.
 * - Fetches and ingests changed messages idempotently.
 */
export async function POST(req: NextRequest) {
  // Validation handshake
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  try {
    await enforceRateLimit(rateLimiters.webhook(), "ms-webhook");
    const body = await req.json();
    const notifications: {
      subscriptionId: string;
      clientState?: string;
      resource: string;
      resourceData?: { id: string };
    }[] = body.value ?? [];

    for (const n of notifications) {
      if (n.clientState !== env.EMAIL_WEBHOOK_SECRET) {
        logger.warn("webhook.ms.bad_client_state", { sub: n.subscriptionId });
        continue;
      }
      const account = await prisma.emailAccount.findFirst({
        where: { subscriptionId: n.subscriptionId, provider: "MICROSOFT" },
      });
      if (!account) continue;

      const messageId = n.resourceData?.id;
      if (!messageId) continue;

      try {
        const { ctx } = await providerCtxFor(account.id);
        const message = await getEmailProvider("MICROSOFT").getMessage(
          ctx,
          messageId,
        );
        await ingestMessage(account, message);
      } catch (e) {
        logger.error("webhook.ms.ingest_failed", {
          account: account.address,
          error: e,
        });
      }
    }

    return new Response(null, { status: 202 });
  } catch (e) {
    logger.error("webhook.ms.error", { error: e });
    return new Response(null, { status: 202 }); // never make Graph retry-storm
  }
}
