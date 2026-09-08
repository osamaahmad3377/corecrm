import "server-only";
import type { ClientRole, InternalRole } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { conflict, notFound, validationError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/crypto";
import { hashPassword, passwordIssues } from "@/server/auth/password";
import { INVITATION_TTL_HOURS } from "@/lib/constants";
import { recordAudit } from "./audit";
import { sendTransactionalEmail } from "@/server/mailer";
import { appUrl } from "@/server/email-templates";
import { renderTemplate } from "./email-template";
import { logger } from "@/lib/logger";

interface CreateInvitationArgs {
  email: string;
  name: string;
  invitedById: string;
  internalRole?: InternalRole;
  clientRole?: ClientRole;
  organizationId?: string;
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}

export async function createInvitation(args: CreateInvitationArgs) {
  const email = args.email.toLowerCase().trim();

  if (!args.internalRole && !args.clientRole) {
    throw validationError("A role is required");
  }
  if (args.clientRole && !args.organizationId) {
    throw validationError("Client invitations need an organization");
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser && existingUser.status !== "INVITED") {
    throw conflict("A user with that email already exists");
  }

  // No duplicate active invitations.
  const active = await prisma.invitation.findFirst({
    where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (active) {
    throw conflict("There is already a pending invitation for that email");
  }

  if (args.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: args.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!org) throw notFound("Organization not found");
    if (org.status === "DISABLED") throw conflict("Organization is disabled");
  }

  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000);

  const invitation = await prisma.$transaction(async (tx) => {
    // Expire any stale invitations for this email.
    await tx.invitation.updateMany({
      where: { email, status: "PENDING" },
      data: { status: "EXPIRED" },
    });

    const inv = await tx.invitation.create({
      data: {
        email,
        name: args.name.trim(),
        tokenHash,
        internalRole: args.internalRole ?? null,
        clientRole: args.clientRole ?? null,
        organizationId: args.organizationId ?? null,
        invitedById: args.invitedById,
        expiresAt,
      },
      include: { organization: { select: { name: true } } },
    });

    // Pre-create the user shell (status INVITED, no password) so relationships
    // can be wired immediately and the login form gives a consistent answer.
    const user = await tx.user.upsert({
      where: { email },
      create: {
        email,
        name: args.name.trim(),
        isInternal: Boolean(args.internalRole),
        internalRole: args.internalRole ?? null,
        status: "INVITED",
      },
      update: {
        name: args.name.trim(),
        isInternal: Boolean(args.internalRole),
        internalRole: args.internalRole ?? null,
      },
    });

    if (args.clientRole && args.organizationId) {
      await tx.organizationUser.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: args.organizationId,
          },
        },
        create: {
          userId: user.id,
          organizationId: args.organizationId,
          role: args.clientRole,
        },
        update: { role: args.clientRole },
      });
    }

    return inv;
  });

  const acceptUrl = `${appUrl()}/invite/${token}`;
  const inviter = await prisma.user.findUnique({
    where: { id: args.invitedById },
    select: { name: true },
  });
  const tpl = await renderTemplate("INVITATION", {
    name: invitation.name,
    inviterName: inviter?.name ?? "The support team",
    context: invitation.organization?.name
      ? `the ${invitation.organization.name} client portal`
      : "the support console",
    acceptUrl,
    expiresHours: INVITATION_TTL_HOURS,
  });
  await sendTransactionalEmail({
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  await recordAudit({
    action: "USER_INVITED",
    entityType: "invitation",
    entityId: invitation.id,
    actorUserId: args.invitedById,
    ipAddress: args.meta?.ipAddress,
    userAgent: args.meta?.userAgent,
    metadata: {
      email,
      internalRole: args.internalRole,
      clientRole: args.clientRole,
      organizationId: args.organizationId,
    },
  });

  logger.info("invitation.created", { email, acceptUrl });

  // In dev without an email provider, surface the link so onboarding still works.
  return { invitation, acceptUrl };
}

export async function resendInvitation(
  invitationId: string,
  actorUserId: string,
) {
  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { organization: { select: { name: true } } },
  });
  if (!inv) throw notFound("Invitation not found");
  if (inv.status === "ACCEPTED") throw conflict("Invitation already accepted");

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000);
  await prisma.invitation.update({
    where: { id: invitationId },
    data: { tokenHash: sha256(token), expiresAt, status: "PENDING" },
  });

  const acceptUrl = `${appUrl()}/invite/${token}`;
  const inviter = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true },
  });
  const tpl = await renderTemplate("INVITATION", {
    name: inv.name,
    inviterName: inviter?.name ?? "The support team",
    context: inv.organization?.name
      ? `the ${inv.organization.name} client portal`
      : "the support console",
    acceptUrl,
    expiresHours: INVITATION_TTL_HOURS,
  });
  await sendTransactionalEmail({
    to: inv.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  await recordAudit({
    action: "USER_INVITATION_RESENT",
    entityType: "invitation",
    entityId: invitationId,
    actorUserId,
    metadata: { email: inv.email },
  });

  return { acceptUrl };
}

export async function revokeInvitation(
  invitationId: string,
  actorUserId: string,
) {
  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });
  if (!inv) throw notFound("Invitation not found");
  if (inv.status === "ACCEPTED") throw conflict("Invitation already accepted");

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: "REVOKED" },
  });
  await recordAudit({
    action: "USER_INVITATION_REVOKED",
    entityType: "invitation",
    entityId: invitationId,
    actorUserId,
    metadata: { email: inv.email },
  });
}

export async function getInvitationByToken(token: string) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (!inv) return null;
  if (inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    return { ...inv, expired: true as const };
  }
  return { ...inv, expired: false as const };
}

interface AcceptInvitationArgs {
  token: string;
  name: string;
  password: string;
  timezone: string;
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}

export async function acceptInvitation(args: AcceptInvitationArgs) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(args.token) },
  });
  if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    throw validationError("This invitation link is invalid or has expired");
  }

  const issues = passwordIssues(args.password);
  if (issues.length) throw validationError(issues.join(" "));

  const hashed = await hashPassword(args.password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.upsert({
      where: { email: inv.email },
      create: {
        email: inv.email,
        name: args.name.trim(),
        hashedPassword: hashed,
        isInternal: Boolean(inv.internalRole),
        internalRole: inv.internalRole,
        status: "ACTIVE",
        emailVerified: new Date(),
        timezone: args.timezone || "UTC",
      },
      update: {
        name: args.name.trim(),
        hashedPassword: hashed,
        status: "ACTIVE",
        emailVerified: new Date(),
        timezone: args.timezone || "UTC",
        isInternal: Boolean(inv.internalRole),
        internalRole: inv.internalRole,
      },
    });

    if (inv.clientRole && inv.organizationId) {
      await tx.organizationUser.upsert({
        where: {
          userId_organizationId: {
            userId: u.id,
            organizationId: inv.organizationId,
          },
        },
        create: {
          userId: u.id,
          organizationId: inv.organizationId,
          role: inv.clientRole,
        },
        update: { role: inv.clientRole },
      });
    }

    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    return u;
  });

  await recordAudit({
    action: "USER_CREATED",
    entityType: "user",
    entityId: user.id,
    actorUserId: user.id,
    ipAddress: args.meta?.ipAddress,
    userAgent: args.meta?.userAgent,
    metadata: { via: "invitation", email: user.email },
  });

  return user;
}
