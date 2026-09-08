import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { SearchInput } from "@/components/search-input";
import { Card } from "@/components/ui/card";
import { ToneBadge } from "@/components/badges";
import { ConvertToTicketButton } from "@/components/emails/convert-to-ticket";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Mail, Paperclip, ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    message?: string;
    q?: string;
  }>;
}) {
  const ctx = await requirePermission("email.inbox.view");
  const sp = await searchParams;

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { displayName: "asc" },
    include: { _count: { select: { messages: true } } },
  });

  const where: Prisma.EmailMessageWhereInput = {};
  if (sp.account && sp.account !== "all") where.emailAccountId = sp.account;
  if (sp.q) {
    where.OR = [
      { subject: { contains: sp.q, mode: "insensitive" } },
      { fromAddress: { contains: sp.q, mode: "insensitive" } },
      { bodyText: { contains: sp.q, mode: "insensitive" } },
      { snippet: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const messages = await prisma.emailMessage.findMany({
    where,
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      emailAccount: { select: { address: true, displayName: true } },
      contact: {
        select: { firstName: true, lastName: true, organizationId: true },
      },
      ticket: { select: { id: true, ticketNumber: true } },
    },
  });

  const selected = sp.message
    ? await prisma.emailMessage.findUnique({
        where: { id: sp.message },
        include: {
          emailAccount: { select: { address: true } },
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              organization: { select: { id: true, name: true } },
            },
          },
          ticket: { select: { id: true, ticketNumber: true, subject: true } },
          emailThread: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fromAddress: true,
                  fromName: true,
                  direction: true,
                  subject: true,
                  bodyHtml: true,
                  bodyText: true,
                  createdAt: true,
                  receivedAt: true,
                },
              },
            },
          },
        },
      })
    : null;

  const q = (key: string, value: string) => {
    const params = new URLSearchParams();
    if (sp.account) params.set("account", sp.account);
    if (sp.q) params.set("q", sp.q);
    params.set(key, value);
    return `/admin/emails/inbox?${params.toString()}`;
  };

  return (
    <>
      <PageHeader title="Inbox" description="All connected support mailboxes." />

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Accounts sidebar */}
        <aside
          className={cn(
            "space-y-1",
            selected && "hidden lg:block",
          )}
        >
          <Link
            href="/admin/emails/inbox"
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm",
              !sp.account || sp.account === "all"
                ? "bg-accent font-medium"
                : "hover:bg-accent/50",
            )}
          >
            <span className="flex items-center gap-2">
              <Mail className="size-4" /> All inboxes
            </span>
          </Link>
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`/admin/emails/inbox?account=${a.id}`}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                sp.account === a.id ? "bg-accent font-medium" : "hover:bg-accent/50",
              )}
            >
              <span className="min-w-0 truncate">{a.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {a._count.messages}
              </span>
            </Link>
          ))}
          {accounts.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No mailboxes connected.{" "}
              <Link
                href="/admin/emails/accounts"
                className="text-primary hover:underline"
              >
                Connect one
              </Link>
              .
            </p>
          )}
        </aside>

        {/* Message list + detail */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className={cn("min-w-0", selected && "hidden lg:block")}>
            <div className="mb-3">
              <SearchInput placeholder="Search email…" />
            </div>
            {messages.length === 0 ? (
              <EmptyState title="No messages" />
            ) : (
              <ul className="divide-y rounded-lg border">
                {messages.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={q("message", m.id)}
                      className={cn(
                        "block px-3 py-2.5 hover:bg-accent/40",
                        sp.message === m.id && "bg-accent/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {m.fromName || m.fromAddress}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {m.receivedAt ? formatRelative(m.receivedAt) : ""}
                        </span>
                      </div>
                      <p className="truncate text-sm">
                        {m.subject || "(no subject)"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.snippet}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {m.ticket ? (
                          <ToneBadge tone="success">
                            {m.ticket.ticketNumber}
                          </ToneBadge>
                        ) : m.direction === "INBOUND" ? (
                          <ToneBadge tone="warning">Unlinked</ToneBadge>
                        ) : (
                          <ToneBadge tone="info">Sent</ToneBadge>
                        )}
                        {m.hasAttachments && (
                          <Paperclip className="size-3 text-muted-foreground" />
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {m.emailAccount.address}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className="min-w-0">
            {!selected ? (
              <div className="hidden h-full items-center justify-center rounded-lg border text-sm text-muted-foreground lg:flex">
                Select a message
              </div>
            ) : (
              <Card className="p-4">
                <Link
                  href={q("message", "")}
                  className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-4" /> Back
                </Link>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b pb-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">
                      {selected.subject || "(no subject)"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selected.fromName ? `${selected.fromName} · ` : ""}
                      {selected.fromAddress}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      to {selected.emailAccount.address} ·{" "}
                      {selected.receivedAt
                        ? formatDateTime(selected.receivedAt, ctx.timezone)
                        : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {selected.contact ? (
                        <ToneBadge tone="primary">
                          {selected.contact.firstName}{" "}
                          {selected.contact.lastName}
                          {selected.contact.organization
                            ? ` · ${selected.contact.organization.name}`
                            : ""}
                        </ToneBadge>
                      ) : (
                        <ToneBadge tone="neutral">Unknown contact</ToneBadge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {selected.ticket ? (
                      <Link
                        href={`/admin/tickets/${selected.ticket.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {selected.ticket.ticketNumber} →
                      </Link>
                    ) : (
                      selected.direction === "INBOUND" && (
                        <ConvertToTicketButton emailMessageId={selected.id} />
                      )
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {(selected.emailThread?.messages ?? [selected]).map((tm) => (
                    <div
                      key={tm.id}
                      className={cn(
                        "rounded-lg border p-3",
                        tm.direction === "OUTBOUND" && "bg-accent/40",
                      )}
                    >
                      <p className="mb-1 text-xs text-muted-foreground">
                        {tm.fromName || tm.fromAddress} ·{" "}
                        {formatDateTime(
                          tm.receivedAt ?? tm.createdAt,
                          ctx.timezone,
                        )}
                      </p>
                      {tm.bodyHtml ? (
                        <iframe
                          title="email-body"
                          sandbox=""
                          className="h-64 w-full rounded border-0 bg-white"
                          srcDoc={tm.bodyHtml}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm">
                          {tm.bodyText}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
