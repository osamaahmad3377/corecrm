import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { conflict, notFound } from "@/lib/errors";
import { recordAudit } from "./audit";
import { createInvitation } from "./invitation";
import { OrganizationInput } from "@/validators/organization";
import { OPEN_STATUS_KEYS } from "@/lib/constants";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

function clean(input: OrganizationInput) {
  const empty = (v?: string) => (v && v.trim() !== "" ? v.trim() : null);
  return {
    name: input.name.trim(),
    legalName: empty(input.legalName),
    website: empty(input.website),
    industry: empty(input.industry),
    addressLine1: empty(input.addressLine1),
    addressLine2: empty(input.addressLine2),
    city: empty(input.city),
    state: empty(input.state),
    country: empty(input.country),
    postalCode: empty(input.postalCode),
    mainPhone: empty(input.mainPhone),
    mainEmail: empty(input.mainEmail),
    accountManagerId: empty(input.accountManagerId),
    notes: empty(input.notes),
  };
}

export async function listOrganizations(opts: {
  q?: string;
  status?: "ACTIVE" | "DISABLED";
  page: number;
  pageSize: number;
}) {
  const where: Prisma.OrganizationWhereInput = {};
  if (opts.status) where.status = opts.status;
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: "insensitive" } },
      { legalName: { contains: opts.q, mode: "insensitive" } },
      { mainEmail: { contains: opts.q, mode: "insensitive" } },
      { city: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  const pageSize = [25, 50, 100].includes(opts.pageSize) ? opts.pageSize : 25;
  const page = Math.max(1, opts.page);

  const [items, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        accountManager: { select: { id: true, name: true } },
        _count: { select: { tickets: true, userLinks: true, contacts: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createOrganization(
  ctx: AuthContext,
  input: OrganizationInput,
  meta?: Meta,
) {
  const data = clean(input);
  const dup = await prisma.organization.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (dup) throw conflict("An organization with that name already exists");

  const org = await prisma.organization.create({ data });
  await recordAudit({
    action: "ORGANIZATION_CREATED",
    entityType: "organization",
    entityId: org.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { name: org.name },
  });
  return org;
}

interface OnboardArgs {
  ctx: AuthContext;
  organization: OrganizationInput;
  primaryContact: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    position?: string;
  };
  inviteClientAdmin: boolean;
  meta?: Meta;
}

export async function onboardOrganization(args: OnboardArgs) {
  const { ctx } = args;
  const org = await createOrganization(ctx, args.organization, args.meta);

  const contact = await prisma.contact.create({
    data: {
      organizationId: org.id,
      firstName: args.primaryContact.firstName.trim(),
      lastName: args.primaryContact.lastName.trim(),
      email: args.primaryContact.email.toLowerCase().trim(),
      phone: args.primaryContact.phone?.trim() || null,
      position: args.primaryContact.position?.trim() || null,
      isPrimary: true,
    },
  });
  await recordAudit({
    action: "CONTACT_CREATED",
    entityType: "contact",
    entityId: contact.id,
    actorUserId: ctx.userId,
    metadata: { organizationId: org.id, primary: true },
  });

  let acceptUrl: string | null = null;
  if (args.inviteClientAdmin) {
    const res = await createInvitation({
      email: contact.email,
      name: `${contact.firstName} ${contact.lastName}`,
      invitedById: ctx.userId,
      clientRole: "CLIENT_ADMIN",
      organizationId: org.id,
      meta: args.meta,
    });
    acceptUrl = res.acceptUrl;
  }

  return { organization: org, contact, acceptUrl };
}

export async function updateOrganization(
  ctx: AuthContext,
  id: string,
  input: OrganizationInput,
  meta?: Meta,
) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) throw notFound("Organization not found");
  const data = clean(input);
  const org = await prisma.organization.update({ where: { id }, data });
  await recordAudit({
    action: "ORGANIZATION_UPDATED",
    entityType: "organization",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
  return org;
}

export async function setOrganizationStatus(
  ctx: AuthContext,
  id: string,
  status: "ACTIVE" | "DISABLED",
  meta?: Meta,
) {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) throw notFound("Organization not found");
  await prisma.organization.update({ where: { id }, data: { status } });
  await recordAudit({
    action: status === "DISABLED" ? "ORGANIZATION_DISABLED" : "ORGANIZATION_ENABLED",
    entityType: "organization",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
}

export async function getOrganizationOverview(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      accountManager: { select: { id: true, name: true, email: true } },
      _count: {
        select: { contacts: true, userLinks: true, assets: true, tickets: true },
      },
    },
  });
  if (!org) throw notFound("Organization not found");

  const [openTickets, criticalOpen, resolvedTickets, resolvedForAvg] =
    await Promise.all([
      prisma.ticket.count({
        where: { organizationId: id, status: { key: { in: OPEN_STATUS_KEYS } } },
      }),
      prisma.ticket.count({
        where: {
          organizationId: id,
          status: { key: { in: OPEN_STATUS_KEYS } },
          priority: { key: "CRITICAL" },
        },
      }),
      prisma.ticket.count({
        where: { organizationId: id, status: { key: "RESOLVED" } },
      }),
      prisma.ticket.findMany({
        where: { organizationId: id, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 200,
        orderBy: { resolvedAt: "desc" },
      }),
    ]);

  const avgResolutionMs =
    resolvedForAvg.length > 0
      ? resolvedForAvg.reduce(
          (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
          0,
        ) / resolvedForAvg.length
      : null;

  return {
    org,
    stats: {
      totalTickets: org._count.tickets,
      openTickets,
      criticalOpen,
      resolvedTickets,
      avgResolutionMs,
    },
  };
}
