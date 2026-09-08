import { requireInternal } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states";
import { formatDuration } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SlaSettingsPage() {
  await requireInternal("SUPPORT_MANAGER");
  const policies = await prisma.slaPolicy.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      organization: { select: { name: true } },
      targets: {
        include: { priority: true },
        orderBy: { priority: { order: "asc" } },
      },
    },
  });

  if (policies.length === 0) {
    return <EmptyState title="No SLA policies" description="Seed a default policy in prisma/seed.ts." />;
  }

  return (
    <div className="space-y-4">
      {policies.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="text-sm">
              {p.name}
              {p.isDefault && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">
                  Default
                </span>
              )}
              {p.organization && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {p.organization.name}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Response within</TableHead>
                  <TableHead>Resolution within</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.targets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.priority.label}</TableCell>
                    <TableCell>{formatDuration(t.responseMinutes)}</TableCell>
                    <TableCell>{formatDuration(t.resolutionMinutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
