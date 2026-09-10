import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuthContext, can } from "@/server/auth/rbac";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { sanitizeMessageHtml, textToHtml } from "@/lib/sanitize";
import { nextTicketNumber } from "./ticket-number";
import { recordAudit } from "./audit";
import { notificationService } from "./notification";
import {
  computeDueDates,
  resolveSlaPolicyId,
  buildSlaView,
} from "./sla";
import { statusByKeyTx, priorityByKeyTx } from "./lookups";
import {
  AddMessageInput,
  CreateTicketInput,
  TicketListFilter,
} from "@/validators/ticket";
import { OPEN_STATUS_KEYS, STATUS_KEYS } from "@/lib/constants";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

// ---------------------------------------------------------------------------
//  Reads
// ---------------------------------------------------------------------------

const ticketListInclude = {
  organization: { select: { id: true, name: true } },
  requester: { select: { firstName: true, lastName: true, email: true } },
  status: true,
  priority: true,
  category: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, name: true, image: true } },
  assignedTeam: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

export async function listTickets(ctx: AuthContext, filter: TicketListFilter) {
  const where: Prisma.TicketWhereInput = {};

  // --- Tenant / organization scoping (server-authoritative) ---
  if (!ctx.isInternal) {
    if (!ctx.organization) throw forbidden();
    where.organizationId = ctx.organization.id;
    // Clients never see cancelled tickets they didn't create; keep it simple:
    // show all tickets in their org.
  } else if (filter.organizationId) {
    where.organizationId = filter.organizationId;
  }

  // --- Views ---
  const view = filter.view ?? "all";
  if (view === "my" && ctx.isInternal) where.assignedAgentId = ctx.userId;
  if (view === "unassigned") where.assignedAgentId = null;
  if (view === "critical") where.priority = { key: "CRITICAL" };
  if (view === "closed") where.status = { isTerminal: true };
  if (view === "sla-breached") {
    where.OR = [{ responseBreached: true }, { resolutionBreached: true }];
  }

  // --- Explicit filters ---
  if (filter.status === "OPEN_ALL") {
    where.status = { key: { in: OPEN_STATUS_KEYS } };
  } else if (filter.status === "CLOSED_ALL") {
    where.status = { isTerminal: true };
  } else if (filter.status) {
    where.status = { key: filter.status };
  }
  if (filter.priority) where.priority = { key: filter.priority };
  if (filter.assignedAgentId === "me" && ctx.isInternal) {
    where.assignedAgentId = ctx.userId;
  } else if (filter.assignedAgentId === "unassigned") {
    where.assignedAgentId = null;
  } else if (
    filter.assignedAgentId &&
    filter.assignedAgentId !== "me" &&
    filter.assignedAgentId !== "unassigned"
  ) {
    where.assignedAgentId = filter.assignedAgentId;
  }

  if (filter.q) {
    const q = filter.q.trim();
    where.AND = [
      {
        OR: [
          { ticketNumber: { contains: q, mode: "insensitive" } },
          { subject: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          {
            requester: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          },
          ...(ctx.isInternal
            ? [{ organization: { name: { contains: q, mode: "insensitive" as const } } }]
            : []),
        ],
      },
    ];
  }

  const orderBy: Prisma.TicketOrderByWithRelationInput =
    filter.sort === "oldest"
      ? { createdAt: "asc" }
      : filter.sort === "updated"
        ? { updatedAt: "desc" }
        : filter.sort === "priority"
          ? { priority: { order: "desc" } }
          : { createdAt: "desc" };

  const pageSize = [25, 50, 100].includes(filter.pageSize)
    ? filter.pageSize
    : 25;
  const page = Math.max(1, filter.page);

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketListInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTicketForContext(
  ctx: AuthContext,
  ticketId: string,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      organization: true,
      requester: true,
      requesterUser: { select: { id: true, name: true, email: true } },
      status: true,
      priority: true,
      category: true,
      subcategory: true,
      assignedAgent: { select: { id: true, name: true, image: true, email: true } },
      assignedTeam: { select: { id: true, name: true } },
      asset: true,
      slaPolicy: { select: { name: true } },
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          authorUser: { select: { id: true, name: true, image: true, isInternal: true } },
          authorContact: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          attachments: { include: { file: true } },
        },
      },
      attachments: {
        where: { ticketMessageId: null },
        include: { file: true },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  });

  if (!ticket) throw notFound("Ticket not found");

  // --- Authorization ---
  if (!ctx.isInternal) {
    if (!ctx.organization || ctx.organization.id !== ticket.organizationId) {
      throw forbidden();
    }
  }

  const canViewInternal = ctx.isInternal && can(ctx, "ticket.viewInternal");

  const messages = ticket.messages.filter(
    (m) => canViewInternal || m.messageType === "PUBLIC_REPLY",
  );

  const activities = canViewInternal
    ? ticket.activities
    : ticket.activities.filter(
        (a) => a.type !== "INTERNAL_NOTE" && a.type !== "CATEGORY_CHANGED",
      );

  const sla = buildSlaView(ticket, ticket.slaPolicy?.name ?? null);

  return { ...ticket, messages, activities, sla, canViewInternal };
}

// ---------------------------------------------------------------------------
//  Writes
// ---------------------------------------------------------------------------

async function resolveInternalRecipients(
  ticket: { assignedAgentId: string | null; assignedTeamId: string | null },
): Promise<string[]> {
  const ids = new Set<string>();
  if (ticket.assignedAgentId) ids.add(ticket.assignedAgentId);
  if (ticket.assignedTeamId) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: ticket.assignedTeamId },
      select: { userId: true },
    });
    members.forEach((m) => ids.add(m.userId));
  }
  if (ids.size === 0) {
    // Fall back to managers + admins so nothing is missed.
    const managers = await prisma.user.findMany({
      where: {
        isInternal: true,
        status: "ACTIVE",
        internalRole: { in: ["ADMIN", "SUPPORT_MANAGER", "SUPER_ADMIN"] },
      },
      select: { id: true },
    });
    managers.forEach((m) => ids.add(m.id));
  }
  return [...ids];
}

async function clientRecipientsForOrg(
  organizationId: string,
  requesterUserId: string | null,
): Promise<string[]> {
  const ids = new Set<string>();
  if (requesterUserId) ids.add(requesterUserId);
  const admins = await prisma.organizationUser.findMany({
    where: { organizationId, role: "CLIENT_ADMIN" },
    select: { userId: true, user: { select: { status: true } } },
  });
  admins.forEach((a) => a.user.status !== "DISABLED" && ids.add(a.userId));
  return [...ids];
}

interface CreatePortalArgs {
  ctx: AuthContext;
  input: CreateTicketInput;
  meta?: Meta;
}

export async function createTicketFromPortal({
  ctx,
  input,
  meta,
}: CreatePortalArgs) {
  if (!ctx.organization) throw forbidden("Only client users can do this");
  const organizationId = ctx.organization.id;

  // Requester contact: match the signed-in user's email within their org, or
  // create a contact record for them.
  const contact = await prisma.contact.upsert({
    where: {
      organizationId_email: { organizationId, email: ctx.email.toLowerCase() },
    },
    create: {
      organizationId,
      email: ctx.email.toLowerCase(),
      firstName: ctx.name.split(" ")[0] ?? ctx.name,
      lastName: ctx.name.split(" ").slice(1).join(" ") || "-",
    },
    update: {},
  });

  return createTicket({
    ctx,
    organizationId,
    requesterContactId: contact.id,
    requesterUserId: ctx.userId,
    source: "PORTAL",
    input,
    meta,
    notifyClient: true,
  });
}

interface CreateInternalArgs {
  ctx: AuthContext;
  organizationId: string;
  requesterContactId: string;
  input: CreateTicketInput & {
    assignedAgentId?: string;
    assignedTeamId?: string;
  };
  meta?: Meta;
}

export async function createTicketInternal({
  ctx,
  organizationId,
  requesterContactId,
  input,
  meta,
}: CreateInternalArgs) {
  if (!can(ctx, "ticket.create")) throw forbidden();
  const contact = await prisma.contact.findFirst({
    where: { id: requesterContactId, organizationId },
    select: { id: true, email: true },
  });
  if (!contact) throw validationError("Requester contact not in that organization");

  const requesterUser = await prisma.organizationUser.findFirst({
    where: { organizationId, user: { email: contact.email } },
    select: { userId: true },
  });

  return createTicket({
    ctx,
    organizationId,
    requesterContactId,
    requesterUserId: requesterUser?.userId ?? null,
    source: "INTERNAL",
    input,
    meta,
    assignedAgentId: input.assignedAgentId || undefined,
    assignedTeamId: input.assignedTeamId || undefined,
    notifyClient: false,
  });
}

interface CreateTicketCore {
  ctx: AuthContext;
  organizationId: string;
  requesterContactId: string;
  requesterUserId: string | null;
  source: "PORTAL" | "INTERNAL" | "EMAIL";
  input: CreateTicketInput;
  meta?: Meta;
  assignedAgentId?: string;
  assignedTeamId?: string;
  notifyClient: boolean;
}

export async function createTicket(args: CreateTicketCore) {
  const { ctx, organizationId, input } = args;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true },
  });
  if (!org) throw notFound("Organization not found");
  if (org.status === "DISABLED") throw conflict("Organization is disabled");

  // Validate optional foreign keys belong to the org.
  if (input.assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: input.assetId, organizationId },
      select: { id: true },
    });
    if (!asset) throw validationError("Selected asset is not valid");
  }
  if (input.categoryId) {
    const cat = await prisma.ticketCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, parentId: true },
    });
    if (!cat) throw validationError("Invalid category");
  }

  const now = new Date();
  const description = sanitizeMessageHtml(textToHtml(input.description));

  const created = await prisma.$transaction(async (tx) => {
    const status = await statusByKeyTx(tx, STATUS_KEYS.NEW);
    const priority = await priorityByKeyTx(tx, input.priorityKey);
    const ticketNumber = await nextTicketNumber(tx, now);
    const slaPolicyId = await resolveSlaPolicyId(tx, organizationId);
    const { responseDueAt, resolutionDueAt } = await computeDueDates(
      tx,
      slaPolicyId,
      priority.id,
      now,
    );

    const ticket = await tx.ticket.create({
      data: {
        ticketNumber,
        organizationId,
        requesterContactId: args.requesterContactId,
        requesterUserId: args.requesterUserId,
        subject: input.subject,
        description,
        categoryId: input.categoryId || null,
        subcategoryId: input.subcategoryId || null,
        statusId: status.id,
        priorityId: priority.id,
        slaPolicyId,
        responseDueAt,
        resolutionDueAt,
        source: args.source,
        service: input.service || null,
        assetId: input.assetId || null,
        location: input.location || null,
        contactPhone: input.contactPhone || null,
        preferredContactMethod:
          (input.preferredContactMethod as "EMAIL" | "PHONE" | "PORTAL") || null,
        impact: (input.impact as "LOW" | "MEDIUM" | "HIGH") || null,
        urgency: (input.urgency as "LOW" | "MEDIUM" | "HIGH") || null,
        requestedDueAt: parseIsoOrNull(input.requestedDueAt),
        assignedAgentId: args.assignedAgentId ?? null,
        assignedTeamId: args.assignedTeamId ?? null,
      },
    });

    await tx.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        actorUserId: ctx.userId,
        type: "CREATED",
        toValue: ticketNumber,
      },
    });

    if (args.assignedAgentId || args.assignedTeamId) {
      await tx.ticketAssignment.create({
        data: {
          ticketId: ticket.id,
          agentId: args.assignedAgentId ?? null,
          teamId: args.assignedTeamId ?? null,
          assignedById: ctx.userId,
        },
      });
      await tx.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          actorUserId: ctx.userId,
          type: "ASSIGNED",
        },
      });
    }

    // Attach any pre-uploaded files.
    if (input.attachments.length) {
      const files = await tx.file.findMany({
        where: {
          id: { in: input.attachments.map((a) => a.fileId) },
          uploadedById: ctx.userId,
        },
        select: { id: true },
      });
      if (files.length) {
        await tx.ticketAttachment.createMany({
          data: files.map((f) => ({ ticketId: ticket.id, fileId: f.id })),
        });
        await tx.ticketActivity.create({
          data: {
            ticketId: ticket.id,
            actorUserId: ctx.userId,
            type: "ATTACHMENT_ADDED",
            toValue: String(files.length),
          },
        });
      }
    }

    return tx.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: {
        requester: true,
        status: true,
        priority: true,
      },
    });
  });

  await recordAudit({
    action: "TICKET_CREATED",
    entityType: "ticket",
    entityId: created.id,
    actorUserId: ctx.userId,
    ipAddress: args.meta?.ipAddress,
    userAgent: args.meta?.userAgent,
    metadata: { ticketNumber: created.ticketNumber, source: args.source },
  });

  const ref = {
    id: created.id,
    ticketNumber: created.ticketNumber,
    subject: created.subject,
  };
  const requesterName = `${created.requester.firstName} ${created.requester.lastName}`.trim();

  // Notify internal team.
  const internalRecipients = await resolveInternalRecipients({
    assignedAgentId: args.assignedAgentId ?? null,
    assignedTeamId: args.assignedTeamId ?? null,
  });
  await notificationService.notifyTicketCreated({
    ticket: ref,
    recipientUserIds: internalRecipients.filter((id) => id !== ctx.userId),
    requesterName,
  });

  // Notify client (portal-originated).
  if (args.notifyClient && args.requesterUserId) {
    await notificationService.notifyClientTicketCreated({
      ticket: ref,
      clientUserId: args.requesterUserId,
    });
  }

  return created;
}

// ---------------------------------------------------------------------------

export async function addMessage(
  ctx: AuthContext,
  ticketId: string,
  input: AddMessageInput,
  meta?: Meta,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { status: true, requester: true },
  });
  if (!ticket) throw notFound("Ticket not found");

  const isInternalNote = input.messageType === "INTERNAL_NOTE";

  // --- Authorization ---
  if (!ctx.isInternal) {
    if (!ctx.organization || ctx.organization.id !== ticket.organizationId) {
      throw forbidden();
    }
    if (isInternalNote) throw forbidden("Clients cannot add internal notes");
  } else if (isInternalNote && !can(ctx, "ticket.internalNote")) {
    throw forbidden();
  } else if (!isInternalNote && !can(ctx, "ticket.publicReply")) {
    throw forbidden();
  }

  const authorType: "CLIENT" | "AGENT" = ctx.isInternal ? "AGENT" : "CLIENT";
  const body = sanitizeMessageHtml(
    input.body.includes("<") ? input.body : textToHtml(input.body),
  );

  const result = await prisma.$transaction(async (tx) => {
    let authorContactId: string | null = null;
    if (!ctx.isInternal) {
      const contact = await tx.contact.upsert({
        where: {
          organizationId_email: {
            organizationId: ticket.organizationId,
            email: ctx.email.toLowerCase(),
          },
        },
        create: {
          organizationId: ticket.organizationId,
          email: ctx.email.toLowerCase(),
          firstName: ctx.name.split(" ")[0] ?? ctx.name,
          lastName: ctx.name.split(" ").slice(1).join(" ") || "-",
        },
        update: {},
      });
      authorContactId = contact.id;
    }

    const message = await tx.ticketMessage.create({
      data: {
        ticketId,
        authorUserId: ctx.isInternal ? ctx.userId : null,
        authorContactId,
        authorType,
        messageType: input.messageType,
        body,
      },
    });

    if (input.attachments.length) {
      const files = await tx.file.findMany({
        where: {
          id: { in: input.attachments.map((a) => a.fileId) },
          uploadedById: ctx.userId,
        },
        select: { id: true },
      });
      if (files.length) {
        await tx.ticketAttachment.createMany({
          data: files.map((f) => ({
            ticketId,
            ticketMessageId: message.id,
            fileId: f.id,
          })),
        });
      }
    }

    await tx.ticketActivity.create({
      data: {
        ticketId,
        actorUserId: ctx.isInternal ? ctx.userId : null,
        type: isInternalNote ? "INTERNAL_NOTE" : "PUBLIC_REPLY",
      },
    });

    // First agent response → record firstResponseAt for SLA.
    const patch: Prisma.TicketUpdateInput = {};
    if (
      ctx.isInternal &&
      !isInternalNote &&
      !ticket.firstResponseAt
    ) {
      patch.firstResponseAt = new Date();
    }
    // Auto-advance status on public replies.
    if (!isInternalNote) {
      if (ctx.isInternal && ticket.status.key === STATUS_KEYS.NEW) {
        patch.status = { connect: { key: STATUS_KEYS.IN_PROGRESS } };
      }
      if (!ctx.isInternal && ticket.status.key === STATUS_KEYS.WAITING_FOR_CLIENT) {
        patch.status = { connect: { key: STATUS_KEYS.WAITING_FOR_INTERNAL } };
      }
    }
    if (Object.keys(patch).length) {
      await tx.ticket.update({ where: { id: ticketId }, data: patch });
    }

    return message;
  });

  await recordAudit({
    action: isInternalNote ? "TICKET_NOTE_ADDED" : "TICKET_MESSAGE_ADDED",
    entityType: "ticket",
    entityId: ticketId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { ticketNumber: ticket.ticketNumber, messageType: input.messageType },
  });

  if (!isInternalNote) {
    const ref = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
    };
    if (ctx.isInternal) {
      const recipients = await clientRecipientsForOrg(
        ticket.organizationId,
        ticket.requesterUserId,
      );
      await notificationService.notifyReply({
        ticket: ref,
        recipientUserIds: recipients,
        authorName: ctx.name,
        bodyHtml: body,
        audience: "CLIENT",
      });
    } else {
      const recipients = await resolveInternalRecipients({
        assignedAgentId: ticket.assignedAgentId,
        assignedTeamId: ticket.assignedTeamId,
      });
      await notificationService.notifyReply({
        ticket: ref,
        recipientUserIds: recipients,
        authorName: ctx.name,
        bodyHtml: body,
        audience: "AGENT",
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------

export async function assignTicket(
  ctx: AuthContext,
  ticketId: string,
  input: { assignedAgentId: string | null; assignedTeamId?: string | null },
  meta?: Meta,
) {
  if (!can(ctx, "ticket.assign")) throw forbidden();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      assignedAgentId: true,
      assignedTeamId: true,
    },
  });
  if (!ticket) throw notFound("Ticket not found");

  if (input.assignedAgentId) {
    const agent = await prisma.user.findFirst({
      where: { id: input.assignedAgentId, isInternal: true, status: "ACTIVE" },
      select: { id: true },
    });
    if (!agent) throw validationError("That agent can't be assigned");
  }
  if (input.assignedTeamId) {
    const team = await prisma.team.findUnique({
      where: { id: input.assignedTeamId },
      select: { id: true },
    });
    if (!team) throw validationError("Unknown team");
  }

  const wasAssigned = ticket.assignedAgentId;

  await prisma.$transaction(async (tx) => {
    await tx.ticketAssignment.updateMany({
      where: { ticketId, unassignedAt: null },
      data: { unassignedAt: new Date() },
    });
    await tx.ticketAssignment.create({
      data: {
        ticketId,
        agentId: input.assignedAgentId,
        teamId: input.assignedTeamId ?? null,
        assignedById: ctx.userId,
      },
    });
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        assignedAgentId: input.assignedAgentId,
        assignedTeamId: input.assignedTeamId ?? ticket.assignedTeamId,
      },
    });
    await tx.ticketActivity.create({
      data: {
        ticketId,
        actorUserId: ctx.userId,
        type: input.assignedAgentId
          ? wasAssigned
            ? "REASSIGNED"
            : "ASSIGNED"
          : "UNASSIGNED",
        fromValue: wasAssigned,
        toValue: input.assignedAgentId,
      },
    });
  });

  await recordAudit({
    action: "TICKET_ASSIGNED",
    entityType: "ticket",
    entityId: ticketId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: {
      ticketNumber: ticket.ticketNumber,
      from: wasAssigned,
      to: input.assignedAgentId,
    },
  });

  if (input.assignedAgentId && input.assignedAgentId !== wasAssigned) {
    await notificationService.notifyTicketAssigned({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
      },
      agentUserId: input.assignedAgentId,
    });
  }
}

// ---------------------------------------------------------------------------

export async function changeStatus(
  ctx: AuthContext,
  ticketId: string,
  statusKey: string,
  meta?: Meta,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { status: true },
  });
  if (!ticket) throw notFound("Ticket not found");

  // --- Authorization ---
  if (ctx.isInternal) {
    if (!can(ctx, "ticket.changeStatus")) throw forbidden();
  } else {
    if (!ctx.organization || ctx.organization.id !== ticket.organizationId) {
      throw forbidden();
    }
    // Clients may only reopen (→ OPEN) or confirm-close a RESOLVED ticket.
    const allowed =
      (ticket.status.key === STATUS_KEYS.RESOLVED &&
        (statusKey === STATUS_KEYS.OPEN || statusKey === STATUS_KEYS.CLOSED));
    if (!allowed) throw forbidden("You can't change the status of this ticket");
  }

  if (statusKey === ticket.status.key) return;

  const target = await prisma.ticketStatus.findUnique({
    where: { key: statusKey },
  });
  if (!target) throw validationError("Unknown status");

  const now = new Date();
  const data: Prisma.TicketUpdateInput = { status: { connect: { id: target.id } } };
  if (statusKey === STATUS_KEYS.RESOLVED) data.resolvedAt = now;
  if (statusKey === STATUS_KEYS.CLOSED) data.closedAt = now;
  if (
    (ticket.status.key === STATUS_KEYS.RESOLVED ||
      ticket.status.key === STATUS_KEYS.CLOSED) &&
    !target.isTerminal
  ) {
    data.reopenedAt = now;
    data.resolvedAt = null;
    data.closedAt = null;
  }

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticketId }, data }),
    prisma.ticketActivity.create({
      data: {
        ticketId,
        actorUserId: ctx.userId,
        type:
          statusKey === STATUS_KEYS.RESOLVED
            ? "RESOLVED"
            : statusKey === STATUS_KEYS.CLOSED
              ? "CLOSED"
              : !target.isTerminal &&
                  (ticket.status.key === STATUS_KEYS.RESOLVED ||
                    ticket.status.key === STATUS_KEYS.CLOSED)
                ? "REOPENED"
                : "STATUS_CHANGED",
        fromValue: ticket.status.key,
        toValue: statusKey,
      },
    }),
  ]);

  await recordAudit({
    action: "TICKET_STATUS_CHANGED",
    entityType: "ticket",
    entityId: ticketId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: {
      ticketNumber: ticket.ticketNumber,
      from: ticket.status.key,
      to: statusKey,
    },
  });

  const ref = {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
  };

  if (statusKey === STATUS_KEYS.RESOLVED && ctx.isInternal) {
    await notificationService.notifyResolved({
      ticket: ref,
      clientUserId: ticket.requesterUserId,
    });
  } else {
    const recipients = ctx.isInternal
      ? await clientRecipientsForOrg(ticket.organizationId, ticket.requesterUserId)
      : await resolveInternalRecipients(ticket);
    await notificationService.notifyStatusChanged({
      ticket: ref,
      recipientUserIds: recipients,
      toStatusLabel: target.label,
      forClient: ctx.isInternal,
    });
  }
}

// ---------------------------------------------------------------------------

export async function changePriority(
  ctx: AuthContext,
  ticketId: string,
  priorityKey: string,
  meta?: Meta,
) {
  if (!can(ctx, "ticket.changePriority")) throw forbidden();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { priority: true },
  });
  if (!ticket) throw notFound("Ticket not found");
  if (ticket.priority.key === priorityKey) return;

  await prisma.$transaction(async (tx) => {
    const target = await priorityByKeyTx(tx, priorityKey);
    // Recompute SLA due dates from the original creation time.
    const { responseDueAt, resolutionDueAt } = await computeDueDates(
      tx,
      ticket.slaPolicyId,
      target.id,
      ticket.createdAt,
    );
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        priorityId: target.id,
        responseDueAt: ticket.firstResponseAt ? ticket.responseDueAt : responseDueAt,
        resolutionDueAt: ticket.resolvedAt ? ticket.resolutionDueAt : resolutionDueAt,
        responseBreached: false,
        resolutionBreached: false,
      },
    });
    await tx.ticketActivity.create({
      data: {
        ticketId,
        actorUserId: ctx.userId,
        type: "PRIORITY_CHANGED",
        fromValue: ticket.priority.key,
        toValue: priorityKey,
      },
    });
  });

  await recordAudit({
    action: "TICKET_PRIORITY_CHANGED",
    entityType: "ticket",
    entityId: ticketId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: {
      ticketNumber: ticket.ticketNumber,
      from: ticket.priority.key,
      to: priorityKey,
    },
  });
}

export async function setTicketDueDate(
  ctx: AuthContext,
  ticketId: string,
  dueAtIso: string | null,
  meta?: Meta,
) {
  if (!can(ctx, "ticket.setDueDate")) throw forbidden();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, ticketNumber: true, dueAt: true },
  });
  if (!ticket) throw notFound("Ticket not found");

  let dueAt: Date | null = null;
  if (dueAtIso) {
    const d = new Date(dueAtIso);
    if (isNaN(d.getTime())) throw validationError("Invalid date");
    dueAt = d;
  }

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticketId }, data: { dueAt } }),
    prisma.ticketActivity.create({
      data: {
        ticketId,
        actorUserId: ctx.userId,
        type: "STATUS_CHANGED",
        fromValue: ticket.dueAt ? ticket.dueAt.toISOString() : null,
        toValue: dueAt ? dueAt.toISOString() : "cleared",
        metadata: { field: "dueAt" },
      },
    }),
  ]);

  await recordAudit({
    action: "TICKET_UPDATED",
    entityType: "ticket",
    entityId: ticketId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { ticketNumber: ticket.ticketNumber, dueAt: dueAt?.toISOString() ?? null },
  });
}

function parseIsoOrNull(v?: string | null): Date | null {
  if (!v || v.trim() === "") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * The client's requested "needed by" date. Editable by the requesting client
 * (or an internal staffer recording it on their behalf); non-binding — only
 * Admin / Support Manager set the real {@link setTicketDueDate}.
 */
export async function setRequestedDueDate(
  ctx: AuthContext,
  ticketId: string,
  iso: string | null,
  meta?: Meta,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      organizationId: true,
      requestedDueAt: true,
      status: { select: { isTerminal: true } },
    },
  });
  if (!ticket) throw notFound("Ticket not found");

  if (!ctx.isInternal) {
    if (!ctx.organization || ctx.organization.id !== ticket.organizationId) {
      throw forbidden();
    }
    if (ticket.status.isTerminal) {
      throw conflict("This ticket is closed");
    }
  } else if (!can(ctx, "ticket.publicReply")) {
    throw forbidden();
  }

  const requestedDueAt = parseIsoOrNull(iso);

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticketId }, data: { requestedDueAt } }),
    prisma.ticketActivity.create({
      data: {
        ticketId,
        actorUserId: ctx.isInternal ? ctx.userId : null,
        type: "STATUS_CHANGED",
        fromValue: ticket.requestedDueAt
          ? ticket.requestedDueAt.toISOString()
          : null,
        toValue: requestedDueAt ? requestedDueAt.toISOString() : "cleared",
        metadata: { field: "requestedDueAt" },
      },
    }),
  ]);

  await recordAudit({
    action: "TICKET_UPDATED",
    entityType: "ticket",
    entityId: ticketId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: {
      ticketNumber: ticket.ticketNumber,
      requestedDueAt: requestedDueAt?.toISOString() ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
//  Dashboard aggregates
// ---------------------------------------------------------------------------

export async function internalDashboardStats(ctx: AuthContext) {
  const [
    openCount,
    criticalOpen,
    awaitingResponse,
    assignedToMe,
    overdue,
    createdToday,
    resolvedToday,
  ] = await Promise.all([
    prisma.ticket.count({ where: { status: { key: { in: OPEN_STATUS_KEYS } } } }),
    prisma.ticket.count({
      where: {
        status: { key: { in: OPEN_STATUS_KEYS } },
        priority: { key: "CRITICAL" },
      },
    }),
    prisma.ticket.count({
      where: { status: { key: "WAITING_FOR_INTERNAL" } },
    }),
    prisma.ticket.count({
      where: {
        assignedAgentId: ctx.userId,
        status: { key: { in: OPEN_STATUS_KEYS } },
      },
    }),
    prisma.ticket.count({
      where: {
        status: { isTerminal: false },
        OR: [{ responseBreached: true }, { resolutionBreached: true }],
      },
    }),
    prisma.ticket.count({ where: { createdAt: { gte: startOfToday() } } }),
    prisma.ticket.count({ where: { resolvedAt: { gte: startOfToday() } } }),
  ]);

  return {
    openCount,
    criticalOpen,
    awaitingResponse,
    assignedToMe,
    overdue,
    createdToday,
    resolvedToday,
  };
}

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function ticketChartData() {
  const [byStatus, byPriority, byOrg, statuses, priorities] = await Promise.all([
    prisma.ticket.groupBy({ by: ["statusId"], _count: true }),
    prisma.ticket.groupBy({ by: ["priorityId"], _count: true }),
    prisma.ticket.groupBy({
      by: ["organizationId"],
      _count: true,
      orderBy: { _count: { organizationId: "desc" } },
      take: 6,
    }),
    prisma.ticketStatus.findMany(),
    prisma.ticketPriority.findMany(),
  ]);

  const orgs = await prisma.organization.findMany({
    where: { id: { in: byOrg.map((o) => o.organizationId) } },
    select: { id: true, name: true },
  });

  // last 14 days of ticket creation
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 13);
  since.setUTCHours(0, 0, 0, 0);
  const recent = await prisma.ticket.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const overTime: { date: string; count: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(since);
    day.setUTCDate(since.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    overTime.push({
      date: key,
      count: recent.filter((r) => r.createdAt.toISOString().slice(0, 10) === key)
        .length,
    });
  }

  return {
    byStatus: byStatus.map((s) => ({
      name: statuses.find((x) => x.id === s.statusId)?.label ?? "?",
      key: statuses.find((x) => x.id === s.statusId)?.key ?? "?",
      value: s._count as number,
    })),
    byPriority: byPriority.map((p) => ({
      name: priorities.find((x) => x.id === p.priorityId)?.label ?? "?",
      key: priorities.find((x) => x.id === p.priorityId)?.key ?? "?",
      value: p._count as number,
    })),
    byOrg: byOrg.map((o) => ({
      name: orgs.find((x) => x.id === o.organizationId)?.name ?? "?",
      value: o._count as number,
    })),
    overTime,
  };
}

// ---------------------------------------------------------------------------
//  Employee ("my tasks") views
// ---------------------------------------------------------------------------

/**
 * The set of tickets an employee "owns" for their portal:
 * assigned directly to them, OR assigned to any team they belong to
 * (regardless of which agent is on it — so the whole group queue is visible).
 */
async function myScopeWhere(ctx: AuthContext): Promise<Prisma.TicketWhereInput> {
  const teams = await prisma.teamMember.findMany({
    where: { userId: ctx.userId },
    select: { teamId: true },
  });
  const teamIds = teams.map((t) => t.teamId);
  return {
    OR: [
      { assignedAgentId: ctx.userId },
      ...(teamIds.length ? [{ assignedTeamId: { in: teamIds } }] : []),
    ],
  };
}

export async function myTeamIds(ctx: AuthContext): Promise<string[]> {
  const teams = await prisma.teamMember.findMany({
    where: { userId: ctx.userId },
    select: { teamId: true },
  });
  return teams.map((t) => t.teamId);
}

export async function listMyTasks(
  ctx: AuthContext,
  filter: TicketListFilter,
) {
  const scope = await myScopeWhere(ctx);
  const where: Prisma.TicketWhereInput = { AND: [scope] };
  const and = where.AND as Prisma.TicketWhereInput[];

  if (filter.status === "OPEN_ALL") {
    and.push({ status: { key: { in: OPEN_STATUS_KEYS } } });
  } else if (filter.status === "CLOSED_ALL") {
    and.push({ status: { isTerminal: true } });
  } else if (filter.status) {
    and.push({ status: { key: filter.status } });
  } else if (filter.view !== "sla-breached" && filter.view !== "closed") {
    // Default view is the open work queue.
    and.push({ status: { key: { in: OPEN_STATUS_KEYS } } });
  } else if (filter.view === "closed") {
    and.push({ status: { isTerminal: true } });
  }
  if (filter.priority) and.push({ priority: { key: filter.priority } });
  if (filter.assignedAgentId === "me") {
    and.push({ assignedAgentId: ctx.userId });
  } else if (filter.assignedAgentId === "unassigned") {
    and.push({ assignedAgentId: null });
  }
  if (filter.view === "sla-breached") {
    and.push({
      OR: [{ responseBreached: true }, { resolutionBreached: true }],
    });
  }
  if (filter.q) {
    and.push({
      OR: [
        { ticketNumber: { contains: filter.q, mode: "insensitive" } },
        { subject: { contains: filter.q, mode: "insensitive" } },
        { organization: { name: { contains: filter.q, mode: "insensitive" } } },
      ],
    });
  }

  const pageSize = [25, 50, 100].includes(filter.pageSize) ? filter.pageSize : 25;
  const page = Math.max(1, filter.page);
  const orderBy: Prisma.TicketOrderByWithRelationInput =
    filter.sort === "priority"
      ? { priority: { order: "desc" } }
      : filter.sort === "oldest"
        ? { createdAt: "asc" }
        : { updatedAt: "desc" };

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketListInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function employeeDashboardStats(ctx: AuthContext) {
  const scope = await myScopeWhere(ctx);
  const teamIds = await myTeamIds(ctx);
  const openScope: Prisma.TicketWhereInput = {
    AND: [scope, { status: { key: { in: OPEN_STATUS_KEYS } } }],
  };
  const [
    openCount,
    assignedToMe,
    teamQueue,
    awaitingResponse,
    overdue,
    dueToday,
    resolvedToday,
    closedTotal,
  ] = await Promise.all([
    prisma.ticket.count({ where: openScope }),
    prisma.ticket.count({
      where: {
        assignedAgentId: ctx.userId,
        status: { key: { in: OPEN_STATUS_KEYS } },
      },
    }),
    teamIds.length
      ? prisma.ticket.count({
          where: {
            assignedTeamId: { in: teamIds },
            assignedAgentId: null,
            status: { key: { in: OPEN_STATUS_KEYS } },
          },
        })
      : Promise.resolve(0),
    prisma.ticket.count({
      where: { AND: [scope, { status: { key: "WAITING_FOR_INTERNAL" } }] },
    }),
    prisma.ticket.count({
      where: {
        AND: [
          scope,
          { status: { isTerminal: false } },
          {
            OR: [
              { responseBreached: true },
              { resolutionBreached: true },
              { dueAt: { lt: new Date() } },
            ],
          },
        ],
      },
    }),
    prisma.ticket.count({
      where: {
        AND: [
          scope,
          { status: { isTerminal: false } },
          { dueAt: { gte: startOfToday(), lt: endOfToday() } },
        ],
      },
    }),
    prisma.ticket.count({
      where: { AND: [scope, { resolvedAt: { gte: startOfToday() } }] },
    }),
    prisma.ticket.count({
      where: { AND: [scope, { status: { isTerminal: true } }] },
    }),
  ]);
  return {
    openCount,
    assignedToMe,
    teamQueue,
    awaitingResponse,
    overdue,
    dueToday,
    resolvedToday,
    closedTotal,
  };
}

/** Status / priority / 14-day trend charts scoped to the employee's tickets. */
export async function employeeChartData(ctx: AuthContext) {
  const scope = await myScopeWhere(ctx);
  const [byStatusRaw, byPriorityRaw, statuses, priorities, recentForTrend] =
    await Promise.all([
      prisma.ticket.groupBy({
        by: ["statusId"],
        where: { AND: [scope] },
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ["priorityId"],
        where: { AND: [scope, { status: { isTerminal: false } }] },
        _count: true,
      }),
      prisma.ticketStatus.findMany(),
      prisma.ticketPriority.findMany(),
      prisma.ticket.findMany({
        where: {
          AND: [
            scope,
            { updatedAt: { gte: daysAgo(13) } },
          ],
        },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

  const trend: { date: string; created: number; resolved: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const day = daysAgo(13 - i);
    const key = day.toISOString().slice(0, 10);
    trend.push({
      date: key,
      created: recentForTrend.filter(
        (t) => t.createdAt.toISOString().slice(0, 10) === key,
      ).length,
      resolved: recentForTrend.filter(
        (t) => t.resolvedAt && t.resolvedAt.toISOString().slice(0, 10) === key,
      ).length,
    });
  }

  return {
    byStatus: byStatusRaw.map((s) => ({
      name: statuses.find((x) => x.id === s.statusId)?.label ?? "?",
      key: statuses.find((x) => x.id === s.statusId)?.key ?? "?",
      value: s._count as number,
    })),
    byPriority: byPriorityRaw.map((p) => ({
      name: priorities.find((x) => x.id === p.priorityId)?.label ?? "?",
      key: priorities.find((x) => x.id === p.priorityId)?.key ?? "?",
      value: p._count as number,
    })),
    trend,
  };
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export async function clientDashboardStats(ctx: AuthContext) {
  if (!ctx.organization) throw forbidden();
  const organizationId = ctx.organization.id;
  const [open, pending, resolved, closed] = await Promise.all([
    prisma.ticket.count({
      where: { organizationId, status: { key: { in: OPEN_STATUS_KEYS } } },
    }),
    prisma.ticket.count({
      where: {
        organizationId,
        status: { key: { in: ["WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL"] } },
      },
    }),
    prisma.ticket.count({
      where: { organizationId, status: { key: "RESOLVED" } },
    }),
    prisma.ticket.count({
      where: { organizationId, status: { key: "CLOSED" } },
    }),
  ]);
  return { open, pending, resolved, closed };
}
