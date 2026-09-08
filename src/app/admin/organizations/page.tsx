import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { listOrganizations } from "@/server/services/organization";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/states";
import { ToneBadge } from "@/components/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Plus } from "lucide-react";
import { can } from "@/server/auth/rbac";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireInternal();
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const pageSize = Number(sp.pageSize ?? 25);

  const result = await listOrganizations({
    q: sp.q,
    status: sp.status as "ACTIVE" | "DISABLED" | undefined,
    page,
    pageSize,
  });

  return (
    <>
      <PageHeader
        title="Organizations"
        description={`${result.total} client organization${result.total === 1 ? "" : "s"}`}
        actions={
          can(ctx, "org.create") && (
            <Button asChild>
              <Link href="/admin/organizations/new">
                <Plus className="size-4" /> Onboard organization
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4">
        <SearchInput placeholder="Search organizations…" />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          description="Onboard your first client to get started."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Account manager</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/admin/organizations/${o.id}`}
                      className="font-medium hover:underline"
                    >
                      {o.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[o.city, o.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.accountManager?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o._count.tickets}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o._count.userLinks}
                  </TableCell>
                  <TableCell>
                    <ToneBadge
                      tone={o.status === "ACTIVE" ? "success" : "neutral"}
                    >
                      {o.status === "ACTIVE" ? "Active" : "Disabled"}
                    </ToneBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataPagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </>
  );
}
