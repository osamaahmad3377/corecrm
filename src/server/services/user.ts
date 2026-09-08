import "server-only";
import type { ClientRole, InternalRole, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { hashPassword, passwordIssues, verifyPassword } from "@/server/auth/password";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/constants";
import { sendTransactionalEmail } from "@/server/mailer";
import { passwordResetEmail, appUrl } from "@/server/email-templates";
import { logger } from "@/lib/logger";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

export async function listInternalUsers(opts: { q?: string }) {
  const where: Prisma.UserWhereInput = { isInternal: true };
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: "insensitive" } },
      { email: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  return prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      internalRole: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      teamLinks: { include: { team: { select: { id: true, name: true } } } },
      _count: { select: { assignedTickets: true } },
    },
  });
}

export async function assignableAgents() {
  return prisma.user.findMany({
    where: { isInternal: true, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, image: true, internalRole: true },
  });
}

export async function listOrganizationUsers(organizationId: string) {
  return prisma.organizationUser.findMany({
    where: { organizationId },
    orderBy: { user: { name: "asc" } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function changeInternalRole(
  ctx: AuthContext,
  userId: string,
  role: InternalRole,
  meta?: Meta,
) {
  if (ctx.userId === userId) {
    throw forbidden("You can't change your own role");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isInternal) throw notFound("User not found");

  await prisma.user.update({
    where: { id: userId },
    data: { internalRole: role },
  });
  await recordAudit({
    action: "USER_ROLE_CHANGED",
    entityType: "user",
    entityId: userId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { from: user.internalRole, to: role },
  });
}

export async function changeClientRole(
  ctx: AuthContext,
  userId: string,
  organizationId: string,
  role: ClientRole,
  meta?: Meta,
) {
  const link = await prisma.organizationUser.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!link) throw notFound("User is not in that organization");

  if (role === "CLIENT_USER" && link.role === "CLIENT_ADMIN") {
    const adminCount = await prisma.organizationUser.count({
      where: { organizationId, role: "CLIENT_ADMIN" },
    });
    if (adminCount <= 1) {
      throw conflict("An organization must keep at least one Client Admin");
    }
  }

  await prisma.organizationUser.update({
    where: { userId_organizationId: { userId, organizationId } },
    data: { role },
  });
  await recordAudit({
    action: "USER_ROLE_CHANGED",
    entityType: "user",
    entityId: userId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { organizationId, from: link.role, to: role },
  });
}

export async function setUserStatus(
  ctx: AuthContext,
  userId: string,
  status: "ACTIVE" | "DISABLED",
  meta?: Meta,
) {
  if (ctx.userId === userId) throw forbidden("You can't disable yourself");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found");
  await prisma.user.update({ where: { id: userId }, data: { status } });
  await recordAudit({
    action: "USER_STATUS_CHANGED",
    entityType: "user",
    entityId: userId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { status },
  });
}

export async function updateProfile(
  ctx: AuthContext,
  input: { name: string; timezone: string },
) {
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { name: input.name.trim(), timezone: input.timezone },
  });
}

export async function changeOwnPassword(
  ctx: AuthContext,
  input: { currentPassword: string; password: string },
  meta?: Meta,
) {
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user) throw notFound();
  const ok = await verifyPassword(input.currentPassword, user.hashedPassword);
  if (!ok) throw validationError("Your current password is incorrect");
  const issues = passwordIssues(input.password);
  if (issues.length) throw validationError(issues.join(" "));
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { hashedPassword: await hashPassword(input.password) },
  });
  await recordAudit({
    action: "USER_PASSWORD_CHANGED",
    entityType: "user",
    entityId: ctx.userId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
}

// --- Password reset (self-service) ---------------------------------------

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, name: true, email: true, status: true },
  });
  // Always behave the same to avoid user enumeration.
  if (!user || user.status === "DISABLED") return;

  const token = randomToken(32);
  await prisma.verificationToken.upsert({
    where: {
      identifier_purpose: { identifier: user.email, purpose: "PASSWORD_RESET" },
    },
    create: {
      identifier: user.email,
      purpose: "PASSWORD_RESET",
      tokenHash: sha256(token),
      expires: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
    update: {
      tokenHash: sha256(token),
      expires: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
  });

  const url = `${appUrl()}/reset-password?token=${token}`;
  const tpl = passwordResetEmail({
    name: user.name,
    resetUrl: url,
    expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
  await sendTransactionalEmail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
  logger.info("password_reset.requested", { userId: user.id, url });
}

export async function resetPassword(token: string, newPassword: string) {
  const hash = sha256(token);
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hash },
  });
  if (
    !record ||
    record.purpose !== "PASSWORD_RESET" ||
    record.expires < new Date()
  ) {
    throw validationError("This reset link is invalid or has expired");
  }
  const issues = passwordIssues(newPassword);
  if (issues.length) throw validationError(issues.join(" "));

  const user = await prisma.user.findUnique({
    where: { email: record.identifier },
  });
  if (!user) throw notFound();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword: await hashPassword(newPassword),
        status: user.status === "INVITED" ? "ACTIVE" : user.status,
        emailVerified: user.emailVerified ?? new Date(),
      },
    }),
    prisma.verificationToken.delete({ where: { tokenHash: hash } }),
  ]);

  await recordAudit({
    action: "USER_PASSWORD_CHANGED",
    entityType: "user",
    entityId: user.id,
    actorUserId: user.id,
    metadata: { via: "reset" },
  });
}
