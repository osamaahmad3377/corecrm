import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db/client";
import { syncAccount } from "@/server/services/email-account";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Gmail push notifications via Google Pub/Sub.
 * The Pub/Sub message contains the mailbox address and a new historyId; we
 * verify the OIDC bearer token audience, then trigger a delta sync for that
 * account (idempotent).
 */
export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit(rateLimiters.webhook(), "google-webhook");

    // Google signs push requests with an OIDC JWT. Verify the audience matches
    // our configured value (full verification would also check Google's certs).
    const auth = req.headers.get("authorization") ?? "";
    const expectedAud = process.env.GOOGLE_PUBSUB_VERIFICATION_AUDIENCE;
    if (expectedAud) {
      const token = auth.replace(/^Bearer\s+/i, "");
      const [, payload] = token.split(".");
      try {
        const claims = JSON.parse(
          Buffer.from(payload, "base64").toString("utf8"),
        );
        if (claims.aud !== expectedAud) {
          return new Response("Bad audience", { status: 403 });
        }
      } catch {
        return new Response("Bad token", { status: 403 });
      }
    }

    const body = await req.json();
    const dataB64 = body?.message?.data;
    if (!dataB64) return new Response(null, { status: 204 });

    const decoded = JSON.parse(
      Buffer.from(dataB64, "base64").toString("utf8"),
    ) as { emailAddress?: string };

    if (decoded.emailAddress) {
      const account = await prisma.emailAccount.findFirst({
        where: { address: decoded.emailAddress.toLowerCase(), provider: "GOOGLE" },
      });
      if (account && account.isActive) {
        await syncAccount(account.id).catch((e) =>
          logger.error("webhook.google.sync_failed", { error: e }),
        );
      }
    }

    return new Response(null, { status: 204 });
  } catch (e) {
    logger.error("webhook.google.error", { error: e });
    return new Response(null, { status: 204 });
  }
}
