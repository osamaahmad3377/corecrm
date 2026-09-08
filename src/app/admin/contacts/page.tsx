import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { listContacts } from "@/server/services/contact";
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
import { Contact } from "lucide-react";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireInternal();
  const sp = await searchParams;

  const result = await listContacts({
    q: sp.q,
    page: Number(sp.page ?? 1),
    pageSize: Number(sp.pageSize ?? 25),
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${result.total} contact${result.total === 1 ? "" : "s"} across all organizations`}
      />
      <div className="mb-4">
        <SearchInput placeholder="Search by name, email, phone…" />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="No contacts found"
          description="Contacts are added from an organization's page."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/organizations/${c.organization.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {c.organization.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.position ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.tickets}
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
