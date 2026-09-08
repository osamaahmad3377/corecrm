import "server-only";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { recordAudit } from "./audit";
import { APP_NAME } from "@/lib/constants";

export interface GeneralSettings {
  companyName: string;
  supportEmail: string;
  defaultTimezone: string;
  defaultPriorityKey: string;
}

const DEFAULTS: GeneralSettings = {
  companyName: APP_NAME,
  supportEmail: "",
  defaultTimezone: "UTC",
  defaultPriorityKey: "MEDIUM",
};

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const rows = await prisma.setting.findMany({
    where: { scope: "GLOBAL", key: { in: Object.keys(DEFAULTS) } },
  });
  const out = { ...DEFAULTS };
  for (const r of rows) {
    (out as Record<string, unknown>)[r.key] = r.value;
  }
  return out;
}

export async function updateGeneralSettings(
  ctx: AuthContext,
  input: Partial<GeneralSettings>,
) {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined);
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of entries) {
      const existing = await tx.setting.findFirst({
        where: { scope: "GLOBAL", organizationId: null, key },
        select: { id: true },
      });
      if (existing) {
        await tx.setting.update({
          where: { id: existing.id },
          data: { value: value as string },
        });
      } else {
        await tx.setting.create({
          data: { scope: "GLOBAL", key, value: value as string },
        });
      }
    }
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "settings",
    actorUserId: ctx.userId,
    metadata: { keys: entries.map(([k]) => k) },
  });
}
