"use server";

import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import { teamInputSchema } from "@/validators/team";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  updateTeam,
} from "@/server/services/team";

function readTeam(fd: FormData) {
  return teamInputSchema.safeParse({
    name: fd.get("name") ?? "",
    description: fd.get("description") ?? "",
    status: fd.get("status") ?? "ACTIVE",
  });
}

export async function createTeamAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("team.manage");
  const parsed = readTeam(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await createTeam(ctx, parsed.data, meta);
    return { message: "Team created", revalidate: ["/admin/team"] };
  });
}

export async function updateTeamAction(
  id: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("team.manage");
  const parsed = readTeam(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await updateTeam(ctx, id, parsed.data, meta);
    return { message: "Saved", revalidate: ["/admin/team"] };
  });
}

export async function deleteTeamAction(id: string): Promise<ActionState> {
  const ctx = await requirePermission("team.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await deleteTeam(ctx, id, meta);
    return { revalidate: ["/admin/team"] };
  });
}

export async function addTeamMemberAction(
  teamId: string,
  userId: string,
): Promise<ActionState> {
  const ctx = await requirePermission("team.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await addTeamMember(ctx, teamId, userId, meta);
    return { revalidate: ["/admin/team"] };
  });
}

export async function removeTeamMemberAction(
  teamId: string,
  userId: string,
): Promise<ActionState> {
  const ctx = await requirePermission("team.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await removeTeamMember(ctx, teamId, userId, meta);
    return { revalidate: ["/admin/team"] };
  });
}
