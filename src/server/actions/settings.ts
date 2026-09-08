"use server";

import { z } from "zod";
import { requirePermission } from "@/server/auth/context";
import { runAction, type ActionState } from "./_helpers";
import { updateGeneralSettings } from "@/server/services/settings";

const schema = z.object({
  companyName: z.string().trim().min(1).max(120),
  supportEmail: z.string().trim().email().or(z.literal("")),
  defaultTimezone: z.string().min(1),
  defaultPriorityKey: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export async function updateGeneralSettingsAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("internal.settings.manage");
  const parsed = schema.safeParse({
    companyName: fd.get("companyName") ?? "",
    supportEmail: fd.get("supportEmail") ?? "",
    defaultTimezone: fd.get("defaultTimezone") ?? "UTC",
    defaultPriorityKey: fd.get("defaultPriorityKey") ?? "MEDIUM",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    await updateGeneralSettings(ctx, parsed.data);
    return { message: "Settings saved", revalidate: ["/admin/settings"] };
  });
}
