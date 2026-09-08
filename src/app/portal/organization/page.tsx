import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/context";
import { getOrganizationOverview } from "@/server/services/organization";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "Organization" };

export default async function PortalOrganizationPage() {
  const ctx = await requireAuth();
  const orgId = ctx.organization!.id;
  const { org, stats } = await getOrganizationOverview(orgId);

  const contacts = await prisma.contact.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
  });

  return (
    <>
      <PageHeader title={org.name} description="Your organization on record with our support team." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total tickets" value={stats.totalTickets} />
        <StatCard label="Open" value={stats.openTickets} tone="primary" />
        <StatCard label="Resolved" value={stats.resolvedTickets} tone="success" />
        <StatCard
          label="Avg resolution"
          value={
            stats.avgResolutionMs
              ? formatDuration(stats.avgResolutionMs / 60000)
              : "—"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Website" value={org.website} />
            <Row label="Industry" value={org.industry} />
            <Row label="Main phone" value={org.mainPhone} />
            <Row label="Main email" value={org.mainEmail} />
            <Row
              label="Address"
              value={[org.addressLine1, org.city, org.state, org.country]
                .filter(Boolean)
                .join(", ")}
            />
            <Row label="Account manager" value={org.accountManager?.name} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {contacts.map((c) => (
                <li key={c.id} className="py-2 text-sm">
                  <p className="font-medium">
                    {c.firstName} {c.lastName}
                    {c.isPrimary && (
                      <span className="ml-2 text-xs text-primary">Primary</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.email}
                    {c.position ? ` · ${c.position}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Need to change organization details? Contact your account manager.
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
