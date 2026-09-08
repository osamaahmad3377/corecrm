import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";

/**
 * SLA computation. Targets live in the database (SlaPolicy → SlaTarget per
 * priority) — no hard-coded minutes. v1 uses elapsed wall-clock time; a business
 * calendar can be layered in later without changing callers.
 */

export interface SlaView {
  policyName: string | null;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
  responseMet: boolean | null;
  resolutionMet: boolean | null;
  responseBreached: boolean;
  resolutionBreached: boolean;
  responseRemainingMs: number | null;
  resolutionRemainingMs: number | null;
}

/** Resolve the SLA policy for an organization (falls back to the global default). */
export async function resolveSlaPolicyId(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string | null> {
  const orgPolicy = await tx.slaPolicy.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { isDefault: "desc" },
    select: { id: true },
  });
  if (orgPolicy) return orgPolicy.id;
  const globalPolicy = await tx.slaPolicy.findFirst({
    where: { organizationId: null, isActive: true, isDefault: true },
    select: { id: true },
  });
  return globalPolicy?.id ?? null;
}

/** Compute response/resolution due dates for a ticket at creation time. */
export async function computeDueDates(
  tx: Prisma.TransactionClient,
  slaPolicyId: string | null,
  priorityId: string,
  from: Date,
): Promise<{ responseDueAt: Date | null; resolutionDueAt: Date | null }> {
  if (!slaPolicyId) return { responseDueAt: null, resolutionDueAt: null };
  const target = await tx.slaTarget.findUnique({
    where: { slaPolicyId_priorityId: { slaPolicyId, priorityId } },
  });
  if (!target) return { responseDueAt: null, resolutionDueAt: null };
  return {
    responseDueAt: new Date(from.getTime() + target.responseMinutes * 60_000),
    resolutionDueAt: new Date(
      from.getTime() + target.resolutionMinutes * 60_000,
    ),
  };
}

interface TicketSlaFields {
  slaPolicyId: string | null;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  responseBreached: boolean;
  resolutionBreached: boolean;
}

export function buildSlaView(
  ticket: TicketSlaFields,
  policyName: string | null,
  now: Date = new Date(),
): SlaView {
  const responseMet =
    ticket.responseDueAt == null
      ? null
      : ticket.firstResponseAt != null &&
        ticket.firstResponseAt <= ticket.responseDueAt;

  const resolutionMet =
    ticket.resolutionDueAt == null
      ? null
      : ticket.resolvedAt != null &&
        ticket.resolvedAt <= ticket.resolutionDueAt;

  const responseBreached =
    ticket.responseBreached ||
    (ticket.responseDueAt != null &&
      ticket.firstResponseAt == null &&
      now > ticket.responseDueAt);

  const resolutionBreached =
    ticket.resolutionBreached ||
    (ticket.resolutionDueAt != null &&
      ticket.resolvedAt == null &&
      now > ticket.resolutionDueAt);

  return {
    policyName,
    responseDueAt: ticket.responseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    responseMet,
    resolutionMet,
    responseBreached,
    resolutionBreached,
    responseRemainingMs:
      ticket.responseDueAt && !ticket.firstResponseAt
        ? ticket.responseDueAt.getTime() - now.getTime()
        : null,
    resolutionRemainingMs:
      ticket.resolutionDueAt && !ticket.resolvedAt
        ? ticket.resolutionDueAt.getTime() - now.getTime()
        : null,
  };
}

/**
 * Reconciliation pass (cron): flag tickets whose response/resolution SLA has
 * been breached since the last run and return them for notification.
 */
export async function sweepSlaBreaches(now: Date = new Date()) {
  const responseBreaches = await prisma.ticket.findMany({
    where: {
      responseBreached: false,
      firstResponseAt: null,
      responseDueAt: { lt: now },
      status: { isTerminal: false },
    },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      assignedAgentId: true,
      assignedTeam: { select: { members: { select: { userId: true } } } },
    },
  });

  const resolutionBreaches = await prisma.ticket.findMany({
    where: {
      resolutionBreached: false,
      resolvedAt: null,
      resolutionDueAt: { lt: now },
      status: { isTerminal: false },
    },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      assignedAgentId: true,
      assignedTeam: { select: { members: { select: { userId: true } } } },
    },
  });

  if (responseBreaches.length) {
    await prisma.ticket.updateMany({
      where: { id: { in: responseBreaches.map((t) => t.id) } },
      data: { responseBreached: true },
    });
  }
  if (resolutionBreaches.length) {
    await prisma.ticket.updateMany({
      where: { id: { in: resolutionBreaches.map((t) => t.id) } },
      data: { resolutionBreached: true },
    });
  }

  return { responseBreaches, resolutionBreaches };
}
