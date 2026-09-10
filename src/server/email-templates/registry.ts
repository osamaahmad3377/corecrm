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

  // ---- Automation templates (used by AutomationRule) --------------------
  {
    key: "CLIENT_ONBOARDING",
    name: "Client onboarding welcome",
    description:
      "Welcome email sent when a client organization is onboarded. Automation: CLIENT_ONBOARDED.",
    variables: [
      "recipientName",
      "organizationName",
      "accountManagerName",
      "portalUrl",
    ],
    subject: "Welcome to {{appName}} support, {{organizationName}}",
    body: "<p>Hi {{recipientName}},</p><p>Welcome aboard! Your organization <strong>{{organizationName}}</strong> is now set up with {{appName}} for IT support.</p><p>From the client portal you can raise support tickets, track their progress, upload screenshots and logs, and message our team directly. Your account manager is {{accountManagerName}}.</p><p>If you have any questions about getting started, just reply to this email.</p>",
    ctaVar: "portalUrl",
    ctaLabel: "Open the client portal",
  },
  {
    key: "INVITATION_REMINDER",
    name: "Invitation reminder",
    description:
      "Nudge when a portal invitation is still unaccepted. Automation: INVITATION_REMINDER.",
    variables: ["recipientName", "organizationName", "acceptUrl", "daysAgo"],
    subject: "Reminder: your {{appName}} invitation is waiting",
    body: "<p>Hi {{recipientName}},</p><p>You were invited to the {{organizationName}} support portal {{daysAgo}} days ago and haven't set up your account yet. It only takes a minute — just choose a password.</p>",
    ctaVar: "acceptUrl",
    ctaLabel: "Accept your invitation",
  },
  {
    key: "CLIENT_WELCOME_ACTIVATED",
    name: "Portal account activated",
    description:
      "Sent right after a client user activates their account and first signs in. Automation: CLIENT_USER_ACTIVATED.",
    variables: ["recipientName", "organizationName", "portalUrl"],
    subject: "You're all set on {{appName}}",
    body: "<p>Hi {{recipientName}},</p><p>Your {{organizationName}} support portal account is active. Here's what you can do from here:</p><ul><li>Raise a support ticket with a structured form</li><li>Track every ticket's status and deadline</li><li>Reply to our team in the ticket conversation</li></ul>",
    ctaVar: "portalUrl",
    ctaLabel: "Go to the portal",
  },
  {
    key: "TICKET_FOLLOW_UP_RESOLVED",
    name: "Resolution follow-up",
    description:
      "Checks in a few days after a ticket is resolved. Automation: TICKET_RESOLVED (delayed).",
    variables: ["recipientName", "ticketNumber", "ticketSubject", "ticketUrl"],
    subject: "[{{ticketNumber}}] Did that fix it?",
    body: "<p>Hi {{recipientName}},</p><p>We marked <strong>{{ticketNumber}}</strong> — {{ticketSubject}} as resolved a few days ago. We just wanted to check the fix is still holding up.</p><p>If everything's working, no need to do anything. If the problem is back, reply on the ticket and we'll pick it straight back up.</p>",
    ctaVar: "ticketUrl",
    ctaLabel: "View the ticket",
  },
  {
    key: "TICKET_AWAITING_CLIENT_REMINDER",
    name: "Waiting on you — reminder",
    description:
      "Sent when a ticket has been waiting on the client for a while. Automation: TICKET_NO_CLIENT_REPLY.",
    variables: [
      "recipientName",
      "ticketNumber",
      "ticketSubject",
      "ticketUrl",
      "daysWaiting",
    ],
    subject: "[{{ticketNumber}}] We're waiting on your reply",
    body: "<p>Hi {{recipientName}},</p><p>Ticket <strong>{{ticketNumber}}</strong> — {{ticketSubject}} has been waiting for your response for {{daysWaiting}} days. Our team needs a bit more information from you to move it forward.</p><p>Please reply on the ticket when you get a chance. If it's no longer an issue, let us know and we'll close it.</p>",
    ctaVar: "ticketUrl",
    ctaLabel: "Reply on the ticket",
  },
  {
    key: "TICKET_STALE_NUDGE",
    name: "Stale ticket check-in",
    description:
      "Sent when an open ticket has had no activity for a while. Automation: TICKET_STALE.",
    variables: ["recipientName", "ticketNumber", "ticketSubject", "ticketUrl"],
    subject: "[{{ticketNumber}}] Still on it — quick update",
    body: "<p>Hi {{recipientName}},</p><p>Just letting you know we haven't forgotten about <strong>{{ticketNumber}}</strong> — {{ticketSubject}}. If anything has changed at your end, or this is now urgent, reply on the ticket and we'll reprioritise.</p>",
    ctaVar: "ticketUrl",
    ctaLabel: "View the ticket",
  },
  {
    key: "WEEKLY_CLIENT_DIGEST",
    name: "Weekly ticket summary",
    description:
      "Weekly roundup of open tickets to a client's admins. Automation: WEEKLY_CLIENT_DIGEST.",
    variables: [
      "recipientName",
      "organizationName",
      "openCount",
      "waitingOnYouCount",
      "resolvedThisWeek",
      "ticketList",
      "portalUrl",
    ],
    subject: "{{organizationName}} — your support summary",
    body: "<p>Hi {{recipientName}},</p><p>Here's where things stand for <strong>{{organizationName}}</strong> this week:</p><ul><li><strong>{{openCount}}</strong> open ticket(s)</li><li><strong>{{waitingOnYouCount}}</strong> waiting on your input</li><li><strong>{{resolvedThisWeek}}</strong> resolved in the last 7 days</li></ul>{{ticketList}}",
    ctaVar: "portalUrl",
    ctaLabel: "Open the portal",
  },
  {
    key: "CLIENT_REENGAGEMENT",
    name: "Re-engagement — inactive user",
    description:
      "Sent to a client user who hasn't signed in for a while. Automation: CLIENT_INACTIVE.",
    variables: [
      "recipientName",
      "organizationName",
      "lastLoginDaysAgo",
      "portalUrl",
    ],
    subject: "Everything OK with your IT, {{recipientName}}?",
    body: "<p>Hi {{recipientName}},</p><p>We noticed it's been {{lastLoginDaysAgo}} days since you last used the {{organizationName}} support portal. If everything's running smoothly, great! If something's been niggling and you just haven't gotten around to logging it, now's a good time.</p>",
    ctaVar: "portalUrl",
    ctaLabel: "Raise a ticket",
  },
];

export const SYSTEM_TEMPLATE_KEYS = SYSTEM_TEMPLATES.map((t) => t.key);
export function findSystemTemplate(key: string) {
  return SYSTEM_TEMPLATES.find((t) => t.key === key);
}
