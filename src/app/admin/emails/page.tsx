import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { ToneBadge } from "@/components/badges";
import { formatRelative } from "@/lib/format";
import { Mail, Inbox, Settings } from "lucide-react";

export const metadata: Metadata = { title: "Email Center" };

export default async function EmailCenterPage() {
  await requirePermission("email.inbox.view");

  const [accounts, totalMessages, unlinked, recentUnlinked] = await Promise.all([
    prisma.emailAccount.findMany({ orderBy: { displayName: "asc" } }),
    prisma.emailMessage.count(),
    prisma.emailMessage.count({ where: { ticketId: null, direction: "INBOUND" } }),
    prisma.emailMessage.findMany({
      where: { ticketId: null, direction: "INBOUND" },
      orderBy: { receivedAt: "desc" },
      take: 8,
      include: { emailAccount: { select: { address: true } } },
    }),
  ]);

  const connected = accounts.filter((a) => a.status === "CONNECTED").length;

  return (
    <>
      <PageHeader
        title="Email Center"
        description="Centralised support inbox across all connected mailboxes."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/emails/accounts">
                <Settings className="size-4" /> Accounts
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/emails/inbox">
                <Inbox className="size-4" /> Open inbox
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Connected mailboxes" value={connected} icon={Mail} />
        <StatCard label="Messages stored" value={totalMessages} icon={Inbox} />
        <StatCard
          label="Unlinked inbound"
          value={unlinked}
          tone={unlinked > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Unlinked incoming email</CardTitle>
        </CardHeader>
        <CardContent>
          {recentUnlinked.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="Incoming emails that match a known contact are linked to tickets automatically."
            />
          ) : (
            <ul className="divide-y">
              {recentUnlinked.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/admin/emails/inbox?account=${m.emailAccountId}&message=${m.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {m.subject || "(no subject)"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.fromName ? `${m.fromName} · ` : ""}
                        {m.fromAddress} → {m.emailAccount.address}
                      </span>
                    </span>
                    <ToneBadge tone="warning">Unlinked</ToneBadge>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {m.receivedAt ? formatRelative(m.receivedAt) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
