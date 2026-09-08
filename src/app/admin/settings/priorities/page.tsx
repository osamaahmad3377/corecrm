import { guardPage, requireInternal } from "@/server/auth/context";
import { getPriorities, getStatuses } from "@/server/services/lookups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge, StatusBadge } from "@/components/badges";

export default async function PrioritiesSettingsPage() {
  await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  const [priorities, statuses] = await Promise.all([
    getPriorities(),
    getStatuses(),
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Priorities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {priorities.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <PriorityBadge priorityKey={p.key} label={p.label} />
              <span className="text-xs text-muted-foreground">
                order {p.order}
                {p.isDefault ? " · default" : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Statuses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <StatusBadge statusKey={s.key} label={s.label} />
              <span className="text-xs text-muted-foreground">
                order {s.order}
                {s.isDefault ? " · default" : ""}
                {s.isTerminal ? " · terminal" : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
