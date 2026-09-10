import "server-only";
import type {
  AutomationAudience,
  AutomationRule,
  AutomationTrigger,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db/client";
import { logger } from "@/lib/logger";
import { sendTransactionalEmail } from "@/server/mailer";
import { renderTemplateById } from "./email-template";
import { appUrl } from "@/server/email-templates";
import { recordAudit } from "./audit";
import { OPEN_STATUS_KEYS } from "@/lib/constants";
import { randomToken, sha256 } from "@/lib/crypto";
import { INVITATION_TTL_HOURS } from "@/lib/constants";

/**
 * Email automation engine.
 *
 * - **Event triggers** (CLIENT_ONBOARDED, TICKET_RESOLVED, …) are fired from the
 *   relevant service via {@link fireAutomationEvent}; a job is scheduled per
 *   matching active rule (immediately or after `delayMinutes`).
 * - **Time-based triggers** (INVITATION_REMINDER, TICKET_STALE, WEEKLY_CLIENT_
 *   DIGEST, …) are evaluated by {@link evaluateTimeBasedRules} on a cron.
 * - {@link processDueAutomationJobs} sends everything that's due.
 *
 * Every send is de-duplicated on `AutomationJob.dedupeKey`, so retries and
 * overlapping cron runs never double-send.
 */

// ---------------------------------------------------------------------------
//  Default rules (seeded via ensureDefaultRules)
// ---------------------------------------------------------------------------

interface DefaultRule {
  name: string;
  description: string;
  trigger: AutomationTrigger;
  templateKey: string;
  audience: AutomationAudience;
  delayMinutes?: number;
  thresholdDays?: number;
  isActive?: boolean;
}

export const DEFAULT_RULES: DefaultRule[] = [
  {
    name: "Client onboarding welcome",
    description: "Welcome the primary contact when an organization is onboarded.",
    trigger: "CLIENT_ONBOARDED",
    templateKey: "CLIENT_ONBOARDING",
    audience: "ORG_PRIMARY_CONTACT",
    delayMinutes: 0,
  },
  {
    name: "Portal account activated",
    description: "Orientation email once a client user signs in for the first time.",
    trigger: "CLIENT_USER_ACTIVATED",
    templateKey: "CLIENT_WELCOME_ACTIVATED",
    audience: "INVITED_PERSON",
    delayMinutes: 10,
  },
  {
    name: "Invitation reminder",
    description: "Nudge invitees who haven't set up their account.",
    trigger: "INVITATION_REMINDER",
    templateKey: "INVITATION_REMINDER",
    audience: "INVITED_PERSON",
    thresholdDays: 3,
  },
  {
    name: "Resolution follow-up",
    description: "Check the fix held up a few days after a ticket is resolved.",
    trigger: "TICKET_RESOLVED",
    templateKey: "TICKET_FOLLOW_UP_RESOLVED",
    audience: "TICKET_REQUESTER",
    delayMinutes: 3 * 24 * 60,
  },
  {
    name: "Waiting on client — reminder",
    description:
      "Remind the client when a ticket has been waiting on them for a while.",
    trigger: "TICKET_NO_CLIENT_REPLY",
    templateKey: "TICKET_AWAITING_CLIENT_REMINDER",
    audience: "TICKET_REQUESTER",
    thresholdDays: 2,
  },
  {
    name: "Stale ticket check-in",
    description: "Reassure the client on open tickets with no recent activity.",
    trigger: "TICKET_STALE",
    templateKey: "TICKET_STALE_NUDGE",
    audience: "TICKET_REQUESTER",
    thresholdDays: 5,
  },
  {
    name: "Weekly ticket summary",
    description: "Weekly open-ticket roundup to each client's admins.",
    trigger: "WEEKLY_CLIENT_DIGEST",
    templateKey: "WEEKLY_CLIENT_DIGEST",
    audience: "ORG_CLIENT_ADMINS",
    thresholdDays: 7,
  },
  {
    name: "Re-engage inactive client",
    description:
      "Reach out to client users who haven't signed in for a long time.",
    trigger: "CLIENT_INACTIVE",
    templateKey: "CLIENT_REENGAGEMENT",
    audience: "ORG_CLIENT_USERS",
    thresholdDays: 45,
    isActive: false,
  },
];

/** Idempotently create the default rule set (called by the seed + settings page). */
export async function ensureDefaultRules() {
  for (const def of DEFAULT_RULES) {
    const existing = await prisma.automationRule.findFirst({
      where: { trigger: def.trigger, isSystem: true },
    });
    if (existing) continue;
    const template = await prisma.emailTemplate.findUnique({
      where: { key: def.templateKey },
    });
    if (!template) {
      logger.warn("automation.missing_template", { key: def.templateKey });
      continue;
    }
    await prisma.automationRule.create({
      data: {
        name: def.name,
        description: def.description,
        trigger: def.trigger,
        emailTemplateId: template.id,
        audience: def.audience,
        delayMinutes: def.delayMinutes ?? 0,
        thresholdDays: def.thresholdDays ?? 3,
        isActive: def.isActive ?? true,
        isSystem: true,
      },
    });
  }
}

// ---------------------------------------------------------------------------
//  Audience resolution
// ---------------------------------------------------------------------------

interface Recipient {
  email: string;
  name: string;
  userId: string | null;
}

async function resolveAudience(
  audience: AutomationAudience,
  entity: {
    ticketId?: string;
    organizationId?: string;
    invitationId?: string;
    userId?: string;
  },
): Promise<Recipient[]> {
  switch (audience) {
    case "TICKET_REQUESTER": {
      if (!entity.ticketId) return [];
      const t = await prisma.ticket.findUnique({
        where: { id: entity.ticketId },
        select: {
          requester: { select: { firstName: true, lastName: true, email: true } },
          requesterUser: { select: { id: true, status: true } },
        },
      });
      if (!t?.requester) return [];
      return [
        {
          email: t.requester.email,
          name: `${t.requester.firstName} ${t.requester.lastName}`.trim(),
          userId:
            t.requesterUser && t.requesterUser.status !== "DISABLED"
              ? t.requesterUser.id
              : null,
        },
      ];
    }
    case "ASSIGNED_AGENT": {
      if (!entity.ticketId) return [];
      const t = await prisma.ticket.findUnique({
        where: { id: entity.ticketId },
        select: {
          assignedAgent: { select: { id: true, name: true, email: true, status: true } },
        },
      });
      if (!t?.assignedAgent || t.assignedAgent.status === "DISABLED") return [];
      return [
        {
          email: t.assignedAgent.email,
          name: t.assignedAgent.name,
          userId: t.assignedAgent.id,
        },
      ];
    }
    case "ORG_PRIMARY_CONTACT": {
      const orgId = await orgIdOf(entity);
      if (!orgId) return [];
      const c =
        (await prisma.contact.findFirst({
          where: { organizationId: orgId, isPrimary: true },
        })) ??
        (await prisma.contact.findFirst({
          where: { organizationId: orgId },
          orderBy: { createdAt: "asc" },
        }));
      if (!c) return [];
      return [
        {
          email: c.email,
          name: `${c.firstName} ${c.lastName}`.trim(),
          userId: null,
        },
      ];
    }
    case "ORG_CLIENT_ADMINS":
    case "ORG_CLIENT_USERS": {
      const orgId = await orgIdOf(entity);
      if (!orgId) return [];
      const links = await prisma.organizationUser.findMany({
        where: {
          organizationId: orgId,
          ...(audience === "ORG_CLIENT_ADMINS" ? { role: "CLIENT_ADMIN" } : {}),
          user: { status: "ACTIVE" },
        },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      return links.map((l) => ({
        email: l.user.email,
        name: l.user.name,
        userId: l.user.id,
      }));
    }
    case "INVITED_PERSON": {
      if (entity.invitationId) {
        const inv = await prisma.invitation.findUnique({
          where: { id: entity.invitationId },
        });
        return inv ? [{ email: inv.email, name: inv.name, userId: null }] : [];
      }
      if (entity.userId) {
        const u = await prisma.user.findUnique({ where: { id: entity.userId } });
        return u ? [{ email: u.email, name: u.name, userId: u.id }] : [];
      }
      return [];
    }
    default:
      return [];
  }
}

async function orgIdOf(entity: {
  ticketId?: string;
  organizationId?: string;
}): Promise<string | null> {
  if (entity.organizationId) return entity.organizationId;
  if (entity.ticketId) {
    const t = await prisma.ticket.findUnique({
      where: { id: entity.ticketId },
      select: { organizationId: true },
    });
    return t?.organizationId ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Variable building
// ---------------------------------------------------------------------------

async function buildVars(
  trigger: AutomationTrigger,
  entity: {
    ticketId?: string;
    organizationId?: string;
    invitationId?: string;
    userId?: string;
  },
  recipient: Recipient,
  rule: AutomationRule,
): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    recipientName: recipient.name || "there",
    portalUrl: `${appUrl()}/portal`,
  };

  const orgId = await orgIdOf(entity);
  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, accountManager: { select: { name: true } } },
    });
    base.organizationName = org?.name ?? "your organization";
    base.accountManagerName = org?.accountManager?.name ?? "your account manager";
  }

  if (entity.ticketId) {
    const t = await prisma.ticket.findUnique({
      where: { id: entity.ticketId },
      select: {
        ticketNumber: true,
        subject: true,
        updatedAt: true,
        resolvedAt: true,
        activities: {
          where: { type: "PUBLIC_REPLY" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    if (t) {
      base.ticketNumber = t.ticketNumber;
      base.ticketSubject = t.subject;
      base.ticketUrl = `${appUrl()}/portal/tickets/${entity.ticketId}`;
      const since = t.activities[0]?.createdAt ?? t.updatedAt;
      base.daysWaiting = Math.max(
        1,
        Math.floor((Date.now() - since.getTime()) / 86_400_000),
      );
    }
  }

  if (trigger === "INVITATION_REMINDER" && entity.invitationId) {
    const inv = await prisma.invitation.findUnique({
      where: { id: entity.invitationId },
    });
    if (inv) {
      base.daysAgo = Math.max(
        1,
        Math.floor((Date.now() - inv.createdAt.getTime()) / 86_400_000),
      );
      // Reissue the token so the reminder link always works.
      const token = randomToken(32);
      await prisma.invitation.update({
        where: { id: inv.id },
        data: {
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000),
        },
      });
      base.acceptUrl = `${appUrl()}/invite/${token}`;
    }
  }

  if (trigger === "CLIENT_INACTIVE" && recipient.userId) {
    const u = await prisma.user.findUnique({
      where: { id: recipient.userId },
      select: { lastLoginAt: true },
    });
    base.lastLoginDaysAgo = u?.lastLoginAt
      ? Math.floor((Date.now() - u.lastLoginAt.getTime()) / 86_400_000)
      : rule.thresholdDays;
  }

  if (trigger === "WEEKLY_CLIENT_DIGEST" && orgId) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [open, waiting, resolved, list] = await Promise.all([
      prisma.ticket.count({
        where: { organizationId: orgId, status: { key: { in: OPEN_STATUS_KEYS } } },
      }),
      prisma.ticket.count({
        where: { organizationId: orgId, status: { key: "WAITING_FOR_CLIENT" } },
      }),
      prisma.ticket.count({
        where: { organizationId: orgId, resolvedAt: { gte: weekAgo } },
      }),
      prisma.ticket.findMany({
        where: { organizationId: orgId, status: { key: { in: OPEN_STATUS_KEYS } } },
        select: {
          ticketNumber: true,
          subject: true,
          status: { select: { label: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);
    base.openCount = open;
    base.waitingOnYouCount = waiting;
    base.resolvedThisWeek = resolved;
    base.ticketList = list.length
      ? `<ul>${list
          .map(
            (t) =>
              `<li><strong>${t.ticketNumber}</strong> — ${escapeHtml(t.subject)} <em>(${t.status.label})</em></li>`,
          )
          .join("")}</ul>`
      : "<p>No open tickets right now — nice work.</p>";
  }

  return base;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

// ---------------------------------------------------------------------------
//  Scheduling
// ---------------------------------------------------------------------------

interface ScheduleArgs {
  rule: AutomationRule;
  entityType: string;
  entityId: string;
  organizationId: string | null;
  recipient: Recipient;
  /** Extra segment for the dedupe key — "" = send once ever. */
  bucket?: string;
  scheduledFor?: Date;
}

async function scheduleJob(args: ScheduleArgs): Promise<boolean> {
  const dedupeKey = [
    args.rule.id,
    `${args.entityType}:${args.entityId}`,
    args.recipient.email.toLowerCase(),
    args.bucket ?? "",
  ].join("|");

  try {
    await prisma.automationJob.create({
      data: {
        ruleId: args.rule.id,
        trigger: args.rule.trigger,
        entityType: args.entityType,
        entityId: args.entityId,
        organizationId: args.organizationId,
        recipientEmail: args.recipient.email,
        recipientUserId: args.recipient.userId,
        scheduledFor:
          args.scheduledFor ??
          new Date(Date.now() + args.rule.delayMinutes * 60_000),
        dedupeKey,
      },
    });
    return true;
  } catch (e) {
    // Unique violation on dedupeKey → already scheduled/sent. Not an error.
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return false;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
//  Event triggers (called from services)
// ---------------------------------------------------------------------------

export interface AutomationEventContext {
  ticketId?: string;
  organizationId?: string;
  invitationId?: string;
  userId?: string;
}

/**
 * Fire an event-driven automation trigger. Schedules a job for every active
 * rule bound to that trigger. Never throws into the caller.
 */
export async function fireAutomationEvent(
  trigger: AutomationTrigger,
  ctx: AutomationEventContext,
): Promise<void> {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { trigger, isActive: true },
    });
    if (!rules.length) return;

    const orgId = await orgIdOf(ctx);
    const entityType = ctx.ticketId
      ? "ticket"
      : ctx.invitationId
        ? "invitation"
        : ctx.userId
          ? "user"
          : "organization";
    const entityId =
      ctx.ticketId ?? ctx.invitationId ?? ctx.userId ?? ctx.organizationId ?? "";

    for (const rule of rules) {
      const recipients = await resolveAudience(rule.audience, ctx);
      // For resolution follow-up, tie the dedupe key to this resolution so a
      // reopened+re-resolved ticket sends again.
      let bucket = "";
      if (trigger === "TICKET_RESOLVED" && ctx.ticketId) {
        const t = await prisma.ticket.findUnique({
          where: { id: ctx.ticketId },
          select: { resolvedAt: true },
        });
        bucket = t?.resolvedAt ? t.resolvedAt.toISOString().slice(0, 10) : "";
      }
      for (const r of recipients) {
        await scheduleJob({
          rule,
          entityType,
          entityId,
          organizationId: orgId,
          recipient: r,
          bucket,
        });
      }
    }
  } catch (e) {
    logger.error("automation.event_failed", { trigger, error: e });
  }
}

// ---------------------------------------------------------------------------
//  Time-based rule evaluation (cron)
// ---------------------------------------------------------------------------

function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function evaluateTimeBasedRules(now: Date = new Date()) {
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      trigger: {
        in: [
          "INVITATION_REMINDER",
          "TICKET_NO_CLIENT_REPLY",
          "TICKET_STALE",
          "WEEKLY_CLIENT_DIGEST",
          "CLIENT_INACTIVE",
        ],
      },
    },
  });

  let scheduled = 0;

  for (const rule of rules) {
    const cutoff = new Date(now.getTime() - rule.thresholdDays * 86_400_000);

    if (rule.trigger === "INVITATION_REMINDER") {
      const invites = await prisma.invitation.findMany({
        where: { status: "PENDING", createdAt: { lt: cutoff } },
      });
      for (const inv of invites) {
        const recipients = await resolveAudience("INVITED_PERSON", {
          invitationId: inv.id,
        });
        for (const r of recipients) {
          if (
            await scheduleJob({
              rule,
              entityType: "invitation",
              entityId: inv.id,
              organizationId: inv.organizationId,
              recipient: r,
              bucket: `d${Math.floor(
                (now.getTime() - inv.createdAt.getTime()) /
                  86_400_000 /
                  rule.thresholdDays,
              )}`,
              scheduledFor: now,
            })
          )
            scheduled++;
        }
      }
    }

    if (
      rule.trigger === "TICKET_NO_CLIENT_REPLY" ||
      rule.trigger === "TICKET_STALE"
    ) {
      const where: Prisma.TicketWhereInput =
        rule.trigger === "TICKET_NO_CLIENT_REPLY"
          ? { status: { key: "WAITING_FOR_CLIENT" }, updatedAt: { lt: cutoff } }
          : {
              status: { key: { in: OPEN_STATUS_KEYS } },
              updatedAt: { lt: cutoff },
            };
      const tickets = await prisma.ticket.findMany({
        where,
        select: { id: true, organizationId: true, updatedAt: true },
        take: 200,
      });
      for (const t of tickets) {
        const recipients = await resolveAudience(rule.audience, {
          ticketId: t.id,
        });
        const period = Math.floor(
          (now.getTime() - t.updatedAt.getTime()) /
            86_400_000 /
            rule.thresholdDays,
        );
        for (const r of recipients) {
          if (
            await scheduleJob({
              rule,
              entityType: "ticket",
              entityId: t.id,
              organizationId: t.organizationId,
              recipient: r,
              bucket: `p${period}`,
              scheduledFor: now,
            })
          )
            scheduled++;
        }
      }
    }

    if (rule.trigger === "WEEKLY_CLIENT_DIGEST") {
      const orgs = await prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      const week = isoWeek(now);
      for (const org of orgs) {
        const openCount = await prisma.ticket.count({
          where: { organizationId: org.id, status: { key: { in: OPEN_STATUS_KEYS } } },
        });
        if (openCount === 0) continue; // nothing worth a digest
        const recipients = await resolveAudience(rule.audience, {
          organizationId: org.id,
        });
        for (const r of recipients) {
          if (
            await scheduleJob({
              rule,
              entityType: "organization",
              entityId: org.id,
              organizationId: org.id,
              recipient: r,
              bucket: week,
              scheduledFor: now,
            })
          )
            scheduled++;
        }
      }
    }

    if (rule.trigger === "CLIENT_INACTIVE") {
      const links = await prisma.organizationUser.findMany({
        where: {
          user: {
            status: "ACTIVE",
            isInternal: false,
            OR: [{ lastLoginAt: { lt: cutoff } }, { lastLoginAt: null }],
          },
        },
        select: {
          organizationId: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });
      const month = now.toISOString().slice(0, 7);
      for (const l of links) {
        if (
          await scheduleJob({
            rule,
            entityType: "user",
            entityId: l.user.id,
            organizationId: l.organizationId,
            recipient: {
              email: l.user.email,
              name: l.user.name,
              userId: l.user.id,
            },
            bucket: month,
            scheduledFor: now,
          })
        )
          scheduled++;
      }
    }

    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: now },
    });
  }

  return { rulesEvaluated: rules.length, jobsScheduled: scheduled };
}

// ---------------------------------------------------------------------------
//  Job processing (cron)
// ---------------------------------------------------------------------------

export async function processDueAutomationJobs(limit = 100) {
  const due = await prisma.automationJob.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    include: { rule: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of due) {
    try {
      if (!job.rule.isActive) {
        await prisma.automationJob.update({
          where: { id: job.id },
          data: { status: "SKIPPED", error: "rule inactive" },
        });
        skipped++;
        continue;
      }

      // Re-check the entity is still in a state that warrants the email.
      const skipReason = await shouldSkip(job.trigger, job.entityType, job.entityId);
      if (skipReason) {
        await prisma.automationJob.update({
          where: { id: job.id },
          data: { status: "SKIPPED", error: skipReason },
        });
        skipped++;
        continue;
      }

      const recipient: Recipient = {
        email: job.recipientEmail,
        name: "",
        userId: job.recipientUserId,
      };
      // Fill the recipient name from the user record if we have one.
      if (job.recipientUserId) {
        const u = await prisma.user.findUnique({
          where: { id: job.recipientUserId },
          select: { name: true },
        });
        recipient.name = u?.name ?? "";
      }

      const vars = await buildVars(
        job.trigger,
        {
          ticketId: job.entityType === "ticket" ? job.entityId : undefined,
          organizationId:
            job.entityType === "organization"
              ? job.entityId
              : (job.organizationId ?? undefined),
          invitationId:
            job.entityType === "invitation" ? job.entityId : undefined,
          userId: job.entityType === "user" ? job.entityId : undefined,
        },
        recipient,
        job.rule,
      );

      const email = await renderTemplateById(job.rule.emailTemplateId, vars);
      if (!email) {
        await prisma.automationJob.update({
          where: { id: job.id },
          data: { status: "SKIPPED", error: "template missing or inactive" },
        });
        skipped++;
        continue;
      }

      const res = await sendTransactionalEmail({
        to: job.recipientEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (res.ok) {
        await prisma.automationJob.update({
          where: { id: job.id },
          data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
        });
        await recordAudit({
          action: "EMAIL_SENT",
          entityType: "automation",
          entityId: job.ruleId,
          metadata: {
            trigger: job.trigger,
            to: job.recipientEmail,
            entity: `${job.entityType}:${job.entityId}`,
          },
        });
        sent++;
      } else {
        await bumpFailure(job.id, job.attempts, "send failed");
        failed++;
      }
    } catch (e) {
      logger.error("automation.job_failed", { jobId: job.id, error: e });
      await bumpFailure(
        job.id,
        job.attempts,
        e instanceof Error ? e.message : "error",
      );
      failed++;
    }
  }

  return { processed: due.length, sent, skipped, failed };
}

async function bumpFailure(id: string, attempts: number, error: string) {
  await prisma.automationJob.update({
    where: { id },
    data: {
      status: attempts + 1 >= 3 ? "FAILED" : "PENDING",
      attempts: { increment: 1 },
      error,
      scheduledFor: new Date(Date.now() + 30 * 60_000), // retry in 30 min
    },
  });
}

/** Guard: has the situation resolved itself since the job was scheduled? */
async function shouldSkip(
  trigger: AutomationTrigger,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  if (entityType === "ticket") {
    const t = await prisma.ticket.findUnique({
      where: { id: entityId },
      select: { status: { select: { key: true, isTerminal: true } } },
    });
    if (!t) return "ticket deleted";
    if (trigger === "TICKET_NO_CLIENT_REPLY" && t.status.key !== "WAITING_FOR_CLIENT")
      return "no longer waiting on client";
    if (trigger === "TICKET_STALE" && t.status.isTerminal)
      return "ticket closed";
  }
  if (trigger === "INVITATION_REMINDER" && entityType === "invitation") {
    const inv = await prisma.invitation.findUnique({ where: { id: entityId } });
    if (!inv || inv.status !== "PENDING") return "invitation already handled";
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Admin management
// ---------------------------------------------------------------------------

export async function listAutomationRules() {
  return prisma.automationRule.findMany({
    orderBy: [{ isSystem: "desc" }, { trigger: "asc" }],
    include: {
      emailTemplate: { select: { id: true, name: true, key: true } },
      _count: { select: { jobs: true } },
    },
  });
}

export async function recentAutomationJobs(limit = 30) {
  return prisma.automationJob.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { rule: { select: { name: true, trigger: true } } },
  });
}
