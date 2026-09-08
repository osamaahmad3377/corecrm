import "server-only";
import { env, features } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface OutboundEmail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Transactional email (invitations, notifications). Uses Resend when configured;
 * otherwise logs the message so local development works without a provider.
 *
 * Support-mailbox email (ticket ↔ client) does NOT go through here — that is
 * sent via the connected email provider (Microsoft Graph / Gmail).
 */
export async function sendTransactionalEmail(
  msg: OutboundEmail,
): Promise<{ ok: boolean; id?: string }> {
  if (!features.transactionalEmail) {
    logger.info("mailer.dev_output", {
      to: msg.to,
      subject: msg.subject,
      preview: msg.text?.slice(0, 200) ?? msg.html.slice(0, 200),
    });
    return { ok: true, id: "dev" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.replyTo,
      }),
    });
    if (!res.ok) {
      logger.error("mailer.send_failed", {
        status: res.status,
        body: await res.text().catch(() => ""),
      });
      return { ok: false };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    logger.error("mailer.exception", { error: e });
    return { ok: false };
  }
}
