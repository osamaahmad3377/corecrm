import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { listAssets } from "@/server/services/asset";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { HardDrive } from "lucide-react";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireInternal();
  const sp = await searchParams;
  const result = await listAssets({
    q: sp.q,
    page: Number(sp.page ?? 1),
    pageSize: Number(sp.pageSize ?? 25),
  });

  return (
    <>
      <PageHeader
        title="Assets"
        description={`${result.total} asset${result.total === 1 ? "" : "s"} across all organizations`}
      />
      <div className="mb-4">
        <SearchInput placeholder="Search by name, serial, hostname…" />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No assets recorded"
          description="Assets are added from an organization's page."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Serial / Hostname</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Warranty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.assetType.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/organizations/${a.organization.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {a.organization.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.serialNumber ?? a.hostname ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.assignedUser?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.warrantyExpiry
                      ? formatDate(a.warrantyExpiry, ctx.timezone)
                      : "—"}
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
