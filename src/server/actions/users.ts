"use server";

import { requireInternal, requirePermission, requireOrgAccess } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import {
  inviteClientUserSchema,
  inviteInternalUserSchema,
} from "@/validators/user";
import { createInvitation, resendInvitation, revokeInvitation } from "@/server/services/invitation";
import {
  changeClientRole,
  changeInternalRole,
  changeOwnPassword,
  setUserStatus,
  updateProfile,
} from "@/server/services/user";
import { updateProfileSchema, changePasswordSchema } from "@/validators/auth";
import { requireAuth } from "@/server/auth/context";

export async function inviteInternalUserAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("internal.users.manage");
  const parsed = inviteInternalUserSchema.safeParse({
    name: fd.get("name") ?? "",
    email: fd.get("email") ?? "",
    internalRole: fd.get("internalRole") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    const { acceptUrl } = await createInvitation({
      email: parsed.data.email,
      name: parsed.data.name,
      internalRole: parsed.data.internalRole,
      invitedById: ctx.userId,
      meta,
    });
    return { message: `Invitation sent. Link: ${acceptUrl}`, revalidate: ["/admin/team"] };
  });
}

export async function inviteClientUserAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireAuth();
  const organizationId = String(fd.get("organizationId") ?? "");

  // Internal staff with onboarding rights, or the org's own CLIENT_ADMIN.
  if (ctx.isInternal) {
    await requirePermission("org.create").catch(async () => {
      await requireInternal("SUPPORT_MANAGER");
    });
  } else {
    await requireOrgAccess(organizationId, { write: true });
  }

  const parsed = inviteClientUserSchema.safeParse({
    name: fd.get("name") ?? "",
    email: fd.get("email") ?? "",
    organizationId,
    clientRole: fd.get("clientRole") ?? "CLIENT_USER",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    const { acceptUrl } = await createInvitation({
      email: parsed.data.email,
      name: parsed.data.name,
      clientRole: parsed.data.clientRole,
      organizationId: parsed.data.organizationId,
      invitedById: ctx.userId,
      meta,
    });
    return {
      message: `Invitation sent. Link: ${acceptUrl}`,
      revalidate: [
        `/admin/organizations/${organizationId}`,
        "/portal/users",
      ],
    };
  });
}

async function authorizeInvitationManagement(invitationId: string) {
  const ctx = await requireAuth();
  const { prisma } = await import("@/server/db/client");
  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { organizationId: true },
  });
  if (!inv) return ctx;
  if (ctx.isInternal) {
    await requireInternal("SUPPORT_MANAGER");
  } else if (inv.organizationId) {
    await requireOrgAccess(inv.organizationId, { write: true });
  } else {
    await requireInternal("SUPPORT_MANAGER");
  }
  return ctx;
}

export async function resendInvitationAction(
  invitationId: string,
): Promise<ActionState> {
  const ctx = await authorizeInvitationManagement(invitationId);
  return runAction(async () => {
    const { acceptUrl } = await resendInvitation(invitationId, ctx.userId);
    return { message: `Invitation resent. Link: ${acceptUrl}` };
  });
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionState> {
  const ctx = await authorizeInvitationManagement(invitationId);
  return runAction(async () => {
    await revokeInvitation(invitationId, ctx.userId);
    return { revalidate: ["/admin/team", "/portal/users"] };
  });
}

export async function changeInternalRoleAction(
  userId: string,
  role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT_MANAGER" | "SUPPORT_AGENT",
): Promise<ActionState> {
  const ctx = await requirePermission("internal.users.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await changeInternalRole(ctx, userId, role, meta);
    return { revalidate: ["/admin/team"] };
  });
}

export async function setInternalUserStatusAction(
  userId: string,
  status: "ACTIVE" | "DISABLED",
): Promise<ActionState> {
  const ctx = await requirePermission("internal.users.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await setUserStatus(ctx, userId, status, meta);
    return { revalidate: ["/admin/team"] };
  });
}

export async function changeClientRoleAction(
  userId: string,
  organizationId: string,
  role: "CLIENT_ADMIN" | "CLIENT_USER",
): Promise<ActionState> {
  const ctx = await requireAuth();
  if (ctx.isInternal) {
    await requireInternal("SUPPORT_MANAGER");
  } else {
    await requireOrgAccess(organizationId, { write: true });
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await changeClientRole(ctx, userId, organizationId, role, meta);
    return {
      revalidate: [
        `/admin/organizations/${organizationId}`,
        "/portal/users",
      ],
    };
  });
}

export async function updateProfileAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireAuth();
  const parsed = updateProfileSchema.safeParse({
    name: fd.get("name") ?? "",
    timezone: fd.get("timezone") ?? "UTC",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    await updateProfile(ctx, parsed.data);
    return {
      message: "Profile updated. Sign out and back in to refresh your session.",
      revalidate: ["/admin/settings/profile", "/portal/profile"],
    };
  });
}

export async function changePasswordAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireAuth();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: fd.get("currentPassword") ?? "",
    password: fd.get("password") ?? "",
    confirmPassword: fd.get("confirmPassword") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await changeOwnPassword(ctx, parsed.data, meta);
    return { message: "Password changed." };
  });
}
