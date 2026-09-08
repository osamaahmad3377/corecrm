import "server-only";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { conflict, notFound, validationError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { TeamInput } from "@/validators/team";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

export async function listTeams() {
  return prisma.team.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, status: true } },
        },
        orderBy: { user: { name: "asc" } },
      },
      _count: { select: { tickets: true } },
    },
  });
}

export async function createTeam(ctx: AuthContext, input: TeamInput, meta?: Meta) {
  const name = input.name.trim();
  const dup = await prisma.team.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (dup) throw conflict("A team with that name already exists");

  const team = await prisma.team.create({
    data: {
      name,
      description: input.description?.trim() || null,
      status: input.status,
    },
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "team",
    entityId: team.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { created: name },
  });
  return team;
}

export async function updateTeam(
  ctx: AuthContext,
  id: string,
  input: TeamInput,
  meta?: Meta,
) {
  const existing = await prisma.team.findUnique({ where: { id } });
  if (!existing) throw notFound("Team not found");
  const name = input.name.trim();
  if (name.toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await prisma.team.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (dup) throw conflict("Another team already uses that name");
  }
  const team = await prisma.team.update({
    where: { id },
    data: {
      name,
      description: input.description?.trim() || null,
      status: input.status,
    },
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "team",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
  return team;
}

export async function deleteTeam(ctx: AuthContext, id: string, meta?: Meta) {
  const team = await prisma.team.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!team) throw notFound("Team not found");
  if (team._count.tickets > 0) {
    throw conflict("This team is assigned to tickets and can't be deleted. Set it to inactive instead.");
  }
  await prisma.team.delete({ where: { id } });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "team",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { deleted: team.name },
  });
}

export async function addTeamMember(
  ctx: AuthContext,
  teamId: string,
  userId: string,
  meta?: Meta,
) {
  const [team, user] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!team) throw notFound("Team not found");
  if (!user || !user.isInternal) throw validationError("Only internal staff can join a team");

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId },
    update: {},
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "team",
    entityId: teamId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { addedMember: userId },
  });
}

export async function removeTeamMember(
  ctx: AuthContext,
  teamId: string,
  userId: string,
  meta?: Meta,
) {
  await prisma.teamMember.deleteMany({ where: { teamId, userId } });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "team",
    entityId: teamId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { removedMember: userId },
  });
}
