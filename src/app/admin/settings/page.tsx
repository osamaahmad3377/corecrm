import { redirect } from "next/navigation";
import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { getGeneralSettings } from "@/server/services/settings";
import { getPriorities } from "@/server/services/lookups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";

export default async function GeneralSettingsPage() {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  if (!can(ctx, "internal.settings.manage")) redirect("/admin/settings/sla");
  const [settings, priorities] = await Promise.all([
    getGeneralSettings(),
    getPriorities(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">General</CardTitle>
      </CardHeader>
      <CardContent>
        <GeneralSettingsForm
          settings={settings}
          priorities={priorities.map((p) => ({ key: p.key, label: p.label }))}
        />
      </CardContent>
    </Card>
  );
}
