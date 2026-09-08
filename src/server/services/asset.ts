import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { conflict, notFound } from "@/lib/errors";
import { recordAudit } from "./audit";
import { AssetInput } from "@/validators/asset";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

function parseDate(v?: string) {
  if (!v || v.trim() === "") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function listAssets(opts: {
  q?: string;
  organizationId?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.AssetWhereInput = {};
  if (opts.organizationId) where.organizationId = opts.organizationId;
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: "insensitive" } },
      { serialNumber: { contains: opts.q, mode: "insensitive" } },
      { hostname: { contains: opts.q, mode: "insensitive" } },
      { model: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  const pageSize = [25, 50, 100].includes(opts.pageSize) ? opts.pageSize : 25;
  const page = Math.max(1, opts.page);
  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        organization: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    }),
    prisma.asset.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function organizationAssets(organizationId: string) {
  return prisma.asset.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, assetType: true, hostname: true },
  });
}

export async function createAsset(
  ctx: AuthContext,
  organizationId: string,
  input: AssetInput,
  meta?: Meta,
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) throw notFound("Organization not found");

  const asset = await prisma.asset.create({
    data: {
      organizationId,
      name: input.name.trim(),
      assetType: input.assetType,
      serialNumber: input.serialNumber?.trim() || null,
      model: input.model?.trim() || null,
      manufacturer: input.manufacturer?.trim() || null,
      ipAddress: input.ipAddress?.trim() || null,
      hostname: input.hostname?.trim() || null,
      purchaseDate: parseDate(input.purchaseDate),
      warrantyExpiry: parseDate(input.warrantyExpiry),
      assignedUserId: input.assignedUserId || null,
      notes: input.notes?.trim() || null,
    },
  });
  await recordAudit({
    action: "ASSET_CREATED",
    entityType: "asset",
    entityId: asset.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { organizationId },
  });
  return asset;
}

export async function updateAsset(
  ctx: AuthContext,
  id: string,
  input: AssetInput,
  meta?: Meta,
) {
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) throw notFound("Asset not found");
  const asset = await prisma.asset.update({
    where: { id },
    data: {
      name: input.name.trim(),
      assetType: input.assetType,
      serialNumber: input.serialNumber?.trim() || null,
      model: input.model?.trim() || null,
      manufacturer: input.manufacturer?.trim() || null,
      ipAddress: input.ipAddress?.trim() || null,
      hostname: input.hostname?.trim() || null,
      purchaseDate: parseDate(input.purchaseDate),
      warrantyExpiry: parseDate(input.warrantyExpiry),
      assignedUserId: input.assignedUserId || null,
      notes: input.notes?.trim() || null,
    },
  });
  await recordAudit({
    action: "ASSET_UPDATED",
    entityType: "asset",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
  return asset;
}

export async function deleteAsset(ctx: AuthContext, id: string, meta?: Meta) {
  const existing = await prisma.asset.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!existing) throw notFound("Asset not found");
  if (existing._count.tickets > 0) {
    throw conflict("This asset is linked to tickets and can't be deleted");
  }
  await prisma.asset.delete({ where: { id } });
  await recordAudit({
    action: "ASSET_DELETED",
    entityType: "asset",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
}
