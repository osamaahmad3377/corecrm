import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import {
  ensureSystemTemplates,
  listTemplates,
} from "@/server/services/email-template";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateManager } from "@/components/settings/template-manager";

export const metadata: Metadata = { title: "Email templates" };

export default async function EmailTemplatesPage() {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  if (!can(ctx, "emailTemplate.manage")) redirect("/admin/settings/sla");

  await ensureSystemTemplates();
  const templates = await listTemplates();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Email templates</CardTitle>
        </CardHeader>
      </Card>
      <TemplateManager
        templates={templates.map((t) => ({
          ...t,
          updatedAt: t.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
