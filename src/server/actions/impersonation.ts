"use server";

import { redirect } from "next/navigation";
import { requirePermission, requestMeta } from "@/server/auth/context";
import {
  clearImpersonation,
  setImpersonation,
} from "@/server/auth/impersonation";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/services/audit";
import { AppError } from "@/lib/errors";
import type { ActionState } from "./_helpers";

/** Start viewing a client organization's portal. Admin / Manager only. */
export async function impersonateOrgAction(organizationId: string) {
  const ctx = await requirePermission("org.impersonate");
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) throw new AppError("NOT_FOUND", "Organization not found");

  await setImpersonation(org.id, ctx.userId);
  const meta = await requestMeta();
  await recordAudit({
    action: "ORGANIZATION_UPDATED",
    entityType: "organization",
    entityId: org.id,
    actorUserId: ctx.userId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { impersonationStarted: true, organization: org.name },
  });
  redirect("/portal");
}

export async function exitImpersonationAction(): Promise<ActionState> {
  await clearImpersonation();
  return { ok: true };
}
