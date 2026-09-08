import { env } from "@/lib/env";
import { APP_NAME } from "@/lib/constants";

/**
 * Transactional email templates. Plain, well-tested HTML with a text fallback —
 * deliberately framework-free so they render identically everywhere.
 */

interface Template {
  subject: string;
  html: string;
  text: string;
}

function layout(opts: {
  heading: string;
  bodyHtml: string;
  bodyText: string;
  cta?: { label: string; url: string };
}): { html: string; text: string } {
  const button = opts.cta
    ? `<tr><td style="padding:24px 0 8px">
         <a href="${opts.cta.url}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${opts.cta.label}</a>
       </td></tr>
       <tr><td style="font-size:12px;color:#6b7280;padding-top:8px">Or paste this link into your browser:<br><span style="word-break:break-all">${opts.cta.url}</span></td></tr>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px">
        <tr><td style="font-size:15px;font-weight:700;color:#111827;padding-bottom:16px">${APP_NAME}</td></tr>
        <tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:12px">${opts.heading}</td></tr>
        <tr><td style="font-size:14px;line-height:1.6;color:#374151">${opts.bodyHtml}</td></tr>
        ${button}
      </table>
      <table role="presentation" width="520" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:12px;color:#9ca3af;padding-top:16px;text-align:center">
          ${APP_NAME} · IT Support &amp; Client Portal
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = `${opts.heading}\n\n${opts.bodyText}${
    opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ""
  }\n\n— ${APP_NAME}`;

  return { html, text };
}

export function invitationEmail(p: {
  name: string;
  inviterName: string;
  organizationName?: string | null;
  acceptUrl: string;
  expiresHours: number;
}): Template {
  const where = p.organizationName
    ? `the <strong>${p.organizationName}</strong> client portal`
    : `the ${APP_NAME} support console`;
  const { html, text } = layout({
    heading: "You've been invited",
    bodyHtml: `<p>Hi ${p.name},</p><p>${p.inviterName} has invited you to ${where}. Click below to set your password and get started. This link expires in ${p.expiresHours} hours.</p>`,
    bodyText: `Hi ${p.name}, ${p.inviterName} invited you to ${
      p.organizationName ? p.organizationName + " client portal" : APP_NAME
    }. Set your password using the link below (expires in ${p.expiresHours} hours).`,
    cta: { label: "Accept invitation", url: p.acceptUrl },
  });
  return { subject: `Your invitation to ${APP_NAME}`, html, text };
}

export function passwordResetEmail(p: {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): Template {
  const { html, text } = layout({
    heading: "Reset your password",
    bodyHtml: `<p>Hi ${p.name},</p><p>We received a request to reset your password. This link expires in ${p.expiresMinutes} minutes. If you didn't ask for this, you can ignore this email.</p>`,
    bodyText: `Hi ${p.name}, use the link below to reset your password (expires in ${p.expiresMinutes} minutes). If you didn't request it, ignore this email.`,
    cta: { label: "Reset password", url: p.resetUrl },
  });
  return { subject: `Reset your ${APP_NAME} password`, html, text };
}

export function ticketCreatedEmail(p: {
  recipientName: string;
  ticketNumber: string;
  subject: string;
  url: string;
  forClient: boolean;
}): Template {
  const { html, text } = layout({
    heading: `Ticket ${p.ticketNumber} created`,
    bodyHtml: `<p>Hi ${p.recipientName},</p><p>${
      p.forClient
        ? "Your support ticket has been logged and our team will be in touch shortly."
        : "A new support ticket has been created."
    }</p><p><strong>${p.ticketNumber}</strong> — ${p.subject}</p>`,
    bodyText: `${p.ticketNumber} — ${p.subject}`,
    cta: { label: "View ticket", url: p.url },
  });
  return { subject: `[${p.ticketNumber}] ${p.subject}`, html, text };
}

export function ticketAssignedEmail(p: {
  agentName: string;
  ticketNumber: string;
  subject: string;
  url: string;
}): Template {
  const { html, text } = layout({
    heading: `Ticket ${p.ticketNumber} assigned to you`,
    bodyHtml: `<p>Hi ${p.agentName},</p><p>You've been assigned <strong>${p.ticketNumber}</strong> — ${p.subject}.</p>`,
    bodyText: `You've been assigned ${p.ticketNumber} — ${p.subject}.`,
    cta: { label: "Open ticket", url: p.url },
  });
  return { subject: `[${p.ticketNumber}] Assigned to you`, html, text };
}

export function ticketReplyEmail(p: {
  recipientName: string;
  ticketNumber: string;
  subject: string;
  authorName: string;
  preview: string;
  url: string;
}): Template {
  const { html, text } = layout({
    heading: `New reply on ${p.ticketNumber}`,
    bodyHtml: `<p>Hi ${p.recipientName},</p><p><strong>${p.authorName}</strong> replied to <strong>${p.ticketNumber}</strong> — ${p.subject}:</p><blockquote style="border-left:3px solid #e5e7eb;margin:12px 0;padding:4px 12px;color:#4b5563">${p.preview}</blockquote>`,
    bodyText: `${p.authorName} replied to ${p.ticketNumber}:\n\n${p.preview}`,
    cta: { label: "View conversation", url: p.url },
  });
  return { subject: `[${p.ticketNumber}] ${p.subject}`, html, text };
}

export function ticketResolvedEmail(p: {
  recipientName: string;
  ticketNumber: string;
  subject: string;
  url: string;
}): Template {
  const { html, text } = layout({
    heading: `Ticket ${p.ticketNumber} resolved`,
    bodyHtml: `<p>Hi ${p.recipientName},</p><p>We've marked <strong>${p.ticketNumber}</strong> — ${p.subject} as resolved. If the issue isn't fully fixed, reply on the ticket to reopen it.</p>`,
    bodyText: `${p.ticketNumber} — ${p.subject} has been resolved. Reply on the ticket to reopen it if needed.`,
    cta: { label: "View ticket", url: p.url },
  });
  return { subject: `[${p.ticketNumber}] Resolved`, html, text };
}

export function emailAccountFailureEmail(p: {
  recipientName: string;
  address: string;
  reason: string;
  url: string;
}): Template {
  const { html, text } = layout({
    heading: "Support mailbox needs attention",
    bodyHtml: `<p>Hi ${p.recipientName},</p><p>We couldn't sync <strong>${p.address}</strong>. Reason: ${p.reason}. Please reconnect the account.</p>`,
    bodyText: `Sync failed for ${p.address}: ${p.reason}. Reconnect the account.`,
    cta: { label: "Manage email accounts", url: p.url },
  });
  return { subject: `Action needed: ${p.address} sync failed`, html, text };
}

export const appUrl = () => env.APP_URL.replace(/\/$/, "");
