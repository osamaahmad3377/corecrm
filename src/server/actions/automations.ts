"use server";

import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import { prisma } from "@/server/db/client";
import { conflict, notFound } from "@/lib/errors";
import { recordAudit } from "@/server/services/audit";
import {
  automationRuleInputSchema,
  createAutomationRuleSchema,
} from "@/validators/automation";
import {
  evaluateTimeBasedRules,
  processDueAutomationJobs,
} from "@/server/services/automation";

function readRule(fd: FormData) {
  return {
    name: fd.get("name") ?? "",
    description: fd.get("description") ?? "",
    emailTemplateId: fd.get("emailTemplateId") ?? "",
    audience: fd.get("audience") ?? "TICKET_REQUESTER",
    delayMinutes: fd.get("delayMinutes") ?? "0",
    thresholdDays: fd.get("thresholdDays") ?? "3",
    isActive: fd.get("isActive") === "on",
  };
}

export async function createAutomationRuleAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  const parsed = createAutomationRuleSchema.safeParse({
    ...readRule(fd),
    trigger: fd.get("trigger") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const tpl = await prisma.emailTemplate.findUnique({
      where: { id: parsed.data.emailTemplateId },
    });
    if (!tpl) throw notFound("Template not found");
    await prisma.automationRule.create({
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        trigger: parsed.data.trigger,
        emailTemplateId: parsed.data.emailTemplateId,
        audience: parsed.data.audience,
        delayMinutes: parsed.data.delayMinutes,
        thresholdDays: parsed.data.thresholdDays,
        isActive: parsed.data.isActive,
        isSystem: false,
      },
    });
    const meta = await requestMeta();
    await recordAudit({
      action: "SETTINGS_UPDATED",
      entityType: "automationRule",
      actorUserId: ctx.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { created: parsed.data.name, trigger: parsed.data.trigger },
    });
    return { message: "Automation created", revalidate: ["/admin/settings/automations"] };
  });
}

export async function updateAutomationRuleAction(
  id: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  const parsed = automationRuleInputSchema.safeParse(readRule(fd));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) throw notFound("Automation not found");
    await prisma.automationRule.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        emailTemplateId: parsed.data.emailTemplateId,
        audience: parsed.data.audience,
        delayMinutes: parsed.data.delayMinutes,
        thresholdDays: parsed.data.thresholdDays,
        isActive: parsed.data.isActive,
      },
    });
    const meta = await requestMeta();
    await recordAudit({
      action: "SETTINGS_UPDATED",
      entityType: "automationRule",
      entityId: id,
      actorUserId: ctx.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { message: "Saved", revalidate: ["/admin/settings/automations"] };
  });
}

export async function toggleAutomationRuleAction(
  id: string,
  isActive: boolean,
): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  return runAction(async () => {
    await prisma.automationRule.update({ where: { id }, data: { isActive } });
    await recordAudit({
      action: "SETTINGS_UPDATED",
      entityType: "automationRule",
      entityId: id,
      actorUserId: ctx.userId,
      metadata: { isActive },
    });
    return { revalidate: ["/admin/settings/automations"] };
  });
}

export async function deleteAutomationRuleAction(
  id: string,
): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  return runAction(async () => {
    const rule = await prisma.automationRule.findUnique({ where: { id } });
    if (!rule) throw notFound("Automation not found");
    if (rule.isSystem) {
      throw conflict("Built-in automations can't be deleted — turn them off instead");
    }
    await prisma.automationRule.delete({ where: { id } });
    await recordAudit({
      action: "SETTINGS_UPDATED",
      entityType: "automationRule",
      entityId: id,
      actorUserId: ctx.userId,
      metadata: { deleted: rule.name },
    });
    return { revalidate: ["/admin/settings/automations"] };
  });
}

/** Run the automation cron once, on demand (for testing / catch-up). */
export async function runAutomationsNowAction(): Promise<ActionState> {
  await requirePermission("emailTemplate.manage");
  return runAction(async () => {
    const evaluated = await evaluateTimeBasedRules();
    const processed = await processDueAutomationJobs(200);
    return {
      message: `Scheduled ${evaluated.jobsScheduled}, sent ${processed.sent}, skipped ${processed.skipped}`,
      revalidate: ["/admin/settings/automations"],
    };
  });
}
