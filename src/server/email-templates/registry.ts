/**
 * System email template definitions. Each is seeded into `EmailTemplate` as an
 * editable row (`isSystem: true`). Admins can change the subject/body or reset
 * to these defaults. `body` is the inner HTML placed inside the shared layout.
 *
 * Placeholders use {{variable}} syntax; unknown variables render as empty.
 */

export interface SystemTemplate {
  key: string;
  name: string;
  description: string;
  /** Variables available to this template, for the settings UI reference. */
  variables: string[];
  subject: string;
  body: string;
  /** CTA link variable name, if the email has a primary button. */
  ctaVar?: string;
  ctaLabel?: string;
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: "INVITATION",
    name: "Client / staff invitation",
    description: "Sent when an admin invites a new user to set their password.",
    variables: ["name", "inviterName", "context", "acceptUrl", "expiresHours"],
    subject: "Your invitation to {{appName}}",
    body: "<p>Hi {{name}},</p><p>{{inviterName}} has invited you to {{context}}. Click below to set your password and get started. This link expires in {{expiresHours}} hours.</p>",
    ctaVar: "acceptUrl",
    ctaLabel: "Accept invitation",
  },
  {
    key: "PASSWORD_RESET",
    name: "Password reset",
    description: "Sent for self-service and admin-initiated password resets.",
    variables: ["name", "resetUrl", "expiresMinutes"],
    subject: "Reset your {{appName}} password",
    body: "<p>Hi {{name}},</p><p>We received a request to reset your password. This link expires in {{expiresMinutes}} minutes. If you didn't ask for this, you can ignore this email.</p>",
    ctaVar: "resetUrl",
    ctaLabel: "Reset password",
  },
  {
    key: "TICKET_CREATED_CLIENT",
    name: "Ticket created (client)",
    description: "Confirmation to the client who raised a ticket.",
    variables: ["recipientName", "ticketNumber", "subject", "url"],
    subject: "[{{ticketNumber}}] {{subject}}",
    body: "<p>Hi {{recipientName}},</p><p>Your support ticket has been logged and our team will be in touch shortly.</p><p><strong>{{ticketNumber}}</strong> — {{subject}}</p>",
    ctaVar: "url",
    ctaLabel: "View ticket",
  },
  {
    key: "TICKET_CREATED_INTERNAL",
    name: "Ticket created (support team)",
    description: "Notifies the support team of a new ticket.",
    variables: ["recipientName", "ticketNumber", "subject", "url", "requesterName"],
    subject: "[{{ticketNumber}}] {{subject}}",
    body: "<p>Hi {{recipientName}},</p><p>A new support ticket has been created by {{requesterName}}.</p><p><strong>{{ticketNumber}}</strong> — {{subject}}</p>",
    ctaVar: "url",
    ctaLabel: "View ticket",
  },
  {
    key: "TICKET_ASSIGNED",
    name: "Ticket assigned",
    description: "Sent to an agent when a ticket is assigned to them.",
    variables: ["agentName", "ticketNumber", "subject", "url"],
    subject: "[{{ticketNumber}}] Assigned to you",
    body: "<p>Hi {{agentName}},</p><p>You've been assigned <strong>{{ticketNumber}}</strong> — {{subject}}.</p>",
    ctaVar: "url",
    ctaLabel: "Open ticket",
  },
  {
    key: "TICKET_REPLY",
    name: "Ticket reply",
    description: "Sent to the other party when someone replies on a ticket.",
    variables: ["recipientName", "ticketNumber", "subject", "authorName", "preview", "url"],
    subject: "[{{ticketNumber}}] {{subject}}",
    body: '<p>Hi {{recipientName}},</p><p><strong>{{authorName}}</strong> replied to <strong>{{ticketNumber}}</strong> — {{subject}}:</p><blockquote style="border-left:3px solid #e5e7eb;margin:12px 0;padding:4px 12px;color:#4b5563">{{preview}}</blockquote>',
    ctaVar: "url",
    ctaLabel: "View conversation",
  },
  {
    key: "TICKET_RESOLVED",
    name: "Ticket resolved",
    description: "Sent to the client when their ticket is marked resolved.",
    variables: ["recipientName", "ticketNumber", "subject", "url"],
    subject: "[{{ticketNumber}}] Resolved",
    body: "<p>Hi {{recipientName}},</p><p>We've marked <strong>{{ticketNumber}}</strong> — {{subject}} as resolved. If the issue isn't fully fixed, reply on the ticket to reopen it.</p>",
    ctaVar: "url",
    ctaLabel: "View ticket",
  },
  {
    key: "EMAIL_ACCOUNT_FAILURE",
    name: "Support mailbox sync failure",
    description: "Alerts admins when a connected mailbox stops syncing.",
    variables: ["recipientName", "address", "reason", "url"],
    subject: "Action needed: {{address}} sync failed",
    body: "<p>Hi {{recipientName}},</p><p>We couldn't sync <strong>{{address}}</strong>. Reason: {{reason}}. Please reconnect the account.</p>",
    ctaVar: "url",
    ctaLabel: "Manage email accounts",
  },
];

export const SYSTEM_TEMPLATE_KEYS = SYSTEM_TEMPLATES.map((t) => t.key);
export function findSystemTemplate(key: string) {
  return SYSTEM_TEMPLATES.find((t) => t.key === key);
}
