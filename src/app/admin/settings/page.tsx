import { requirePermission } from "@/server/auth/context";
import { getGeneralSettings } from "@/server/services/settings";
import { getPriorities } from "@/server/services/lookups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";

export default async function GeneralSettingsPage() {
  await requirePermission("internal.settings.manage");
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
