import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import {
  ensureDefaultRules,
  listAutomationRules,
  recentAutomationJobs,
} from "@/server/services/automation";
import { ensureSystemTemplates, listTemplates } from "@/server/services/email-template";
import { AutomationManager } from "@/components/settings/automation-manager";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsSettingsPage() {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  if (!can(ctx, "emailTemplate.manage")) redirect("/admin/settings/sla");

  await ensureSystemTemplates();
  await ensureDefaultRules();

  const [rules, templates, jobs] = await Promise.all([
    listAutomationRules(),
    listTemplates(),
    recentAutomationJobs(30),
  ]);

  return (
    <AutomationManager
      rules={rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        trigger: r.trigger,
        audience: r.audience,
        delayMinutes: r.delayMinutes,
        thresholdDays: r.thresholdDays,
        isActive: r.isActive,
        isSystem: r.isSystem,
        lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
        emailTemplate: r.emailTemplate,
        _count: r._count,
      }))}
      templates={templates.map((t) => ({ id: t.id, name: t.name, key: t.key }))}
      jobs={jobs.map((j) => ({
        id: j.id,
        status: j.status,
        trigger: j.trigger,
        recipientEmail: j.recipientEmail,
        scheduledFor: j.scheduledFor.toISOString(),
        sentAt: j.sentAt ? j.sentAt.toISOString() : null,
        error: j.error,
        createdAt: j.createdAt.toISOString(),
        rule: j.rule,
      }))}
    />
  );
}
