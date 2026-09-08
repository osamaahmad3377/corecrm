import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { conflict, notFound } from "@/lib/errors";
import { recordAudit } from "./audit";
import { ContactInput } from "@/validators/contact";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

export async function listContacts(opts: {
  q?: string;
  organizationId?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.ContactWhereInput = {};
  if (opts.organizationId) where.organizationId = opts.organizationId;
  if (opts.q) {
    where.OR = [
      { firstName: { contains: opts.q, mode: "insensitive" } },
      { lastName: { contains: opts.q, mode: "insensitive" } },
      { email: { contains: opts.q, mode: "insensitive" } },
      { phone: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  const pageSize = [25, 50, 100].includes(opts.pageSize) ? opts.pageSize : 25;
  const page = Math.max(1, opts.page);
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { tickets: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createContact(
  ctx: AuthContext,
  organizationId: string,
  input: ContactInput,
  meta?: Meta,
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) throw notFound("Organization not found");

  const email = input.email.toLowerCase().trim();
  const dup = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId, email } },
  });
  if (dup) throw conflict("A contact with that email already exists in this organization");

  const contact = await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({
        where: { organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.contact.create({
      data: {
        organizationId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        position: input.position?.trim() || null,
        notes: input.notes?.trim() || null,
        isPrimary: input.isPrimary,
      },
    });
  });

  await recordAudit({
    action: "CONTACT_CREATED",
    entityType: "contact",
    entityId: contact.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { organizationId },
  });
  return contact;
}

export async function updateContact(
  ctx: AuthContext,
  id: string,
  input: ContactInput,
  meta?: Meta,
) {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) throw notFound("Contact not found");

  const email = input.email.toLowerCase().trim();
  if (email !== existing.email) {
    const dup = await prisma.contact.findUnique({
      where: {
        organizationId_email: { organizationId: existing.organizationId, email },
      },
    });
    if (dup) throw conflict("Another contact already uses that email");
  }

  const contact = await prisma.$transaction(async (tx) => {
    if (input.isPrimary && !existing.isPrimary) {
      await tx.contact.updateMany({
        where: { organizationId: existing.organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.contact.update({
      where: { id },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        position: input.position?.trim() || null,
        notes: input.notes?.trim() || null,
        isPrimary: input.isPrimary,
      },
    });
  });

  await recordAudit({
    action: "CONTACT_UPDATED",
    entityType: "contact",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
  return contact;
}

export async function deleteContact(ctx: AuthContext, id: string, meta?: Meta) {
  const existing = await prisma.contact.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!existing) throw notFound("Contact not found");
  if (existing._count.tickets > 0) {
    throw conflict("This contact has tickets and can't be deleted");
  }
  await prisma.contact.delete({ where: { id } });
  await recordAudit({
    action: "CONTACT_DELETED",
    entityType: "contact",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
}

/** Resolve an inbound email address to a contact + organization. */
export async function resolveContactByEmail(email: string) {
  return prisma.contact.findFirst({
    where: { email: email.toLowerCase().trim() },
    include: { organization: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
}
