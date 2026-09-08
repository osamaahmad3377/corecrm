import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { getOrganizationOverview } from "@/server/services/organization";
import { listOrganizationUsers } from "@/server/services/user";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  StatusBadge,
  PriorityBadge,
  ToneBadge,
} from "@/components/badges";
import { EmptyState } from "@/components/states";
import { EditOrgForm } from "@/components/organizations/edit-org-form";
import { ContactDialog } from "@/components/organizations/contact-dialog";
import { AssetDialog } from "@/components/organizations/asset-dialog";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import {
  OrgStatusToggle,
  ClientRoleSelect,
  InvitationActions,
  DeleteContactButton,
  DeleteAssetButton,
} from "@/components/organizations/org-actions";
import { formatDate, formatRelative, formatDuration } from "@/lib/format";
import { Pencil, Plus } from "lucide-react";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const ctx = await requireInternal();
  const { organizationId } = await params;

  let data;
  try {
    data = await getOrganizationOverview(organizationId);
  } catch {
    notFound();
  }
  const { org, stats } = data;
  const canManage = can(ctx, "org.update");

  const [contacts, users, invitations, tickets, assets, activity] =
    await Promise.all([
      prisma.contact.findMany({
        where: { organizationId },
        orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
      }),
      listOrganizationUsers(organizationId),
      prisma.invitation.findMany({
        where: { organizationId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.ticket.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { status: true, priority: true },
      }),
      prisma.asset.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { entityType: "organization", entityId: organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: { select: { name: true } } },
      }),
    ]);

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/organizations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organizations
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {org.name}
            <ToneBadge tone={org.status === "ACTIVE" ? "success" : "neutral"}>
              {org.status === "ACTIVE" ? "Active" : "Disabled"}
            </ToneBadge>
          </span>
        }
        description={[org.industry, org.city, org.country]
          .filter(Boolean)
          .join(" · ")}
        actions={
          canManage && <OrgStatusToggle id={org.id} status={org.status} />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total tickets" value={stats.totalTickets} />
        <StatCard label="Open" value={stats.openTickets} tone="primary" />
        <StatCard
          label="Critical open"
          value={stats.criticalOpen}
          tone={stats.criticalOpen ? "destructive" : "default"}
        />
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

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="assets">Assets ({assets.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Legal name" value={org.legalName} />
                <Row
                  label="Website"
                  value={
                    org.website ? (
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {org.website}
                      </a>
                    ) : null
                  }
                />
                <Row label="Main phone" value={org.mainPhone} />
                <Row label="Main email" value={org.mainEmail} />
                <Row
                  label="Address"
                  value={[
                    org.addressLine1,
                    org.city,
                    org.state,
                    org.postalCode,
                    org.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                />
                <Row
                  label="Account manager"
                  value={org.accountManager?.name}
                />
                <Row
                  label="Created"
                  value={formatDate(org.createdAt, ctx.timezone)}
                />
                {org.notes && <Row label="Notes" value={org.notes} />}
              </CardContent>
            </Card>

            {canManage && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Edit organization</CardTitle>
                </CardHeader>
                <CardContent>
                  <EditOrgForm org={org} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts" className="mt-4">
          <div className="mb-3 flex justify-end">
            <ContactDialog
              organizationId={org.id}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> Add contact
                </Button>
              }
            />
          </div>
          {contacts.length === 0 ? (
            <EmptyState title="No contacts yet" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.firstName} {c.lastName}
                        {c.isPrimary && (
                          <ToneBadge tone="primary" className="ml-2">
                            Primary
                          </ToneBadge>
                        )}
                      </TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell>{c.phone ?? "—"}</TableCell>
                      <TableCell>{c.position ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ContactDialog
                            organizationId={org.id}
                            contact={c}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            }
                          />
                          <DeleteContactButton
                            id={c.id}
                            organizationId={org.id}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <InviteUserDialog
              kind="client"
              organizationId={org.id}
              triggerLabel="Invite user"
            />
          </div>

          {users.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.user.name}</TableCell>
                      <TableCell>{u.user.email}</TableCell>
                      <TableCell>
                        <ClientRoleSelect
                          userId={u.userId}
                          organizationId={org.id}
                          role={u.role}
                        />
                      </TableCell>
                      <TableCell>
                        <ToneBadge
                          tone={
                            u.user.status === "ACTIVE"
                              ? "success"
                              : u.user.status === "INVITED"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {u.user.status}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.user.lastLoginAt
                          ? formatRelative(u.user.lastLoginAt)
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pending invitations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {invitations.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{inv.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.email} · expires{" "}
                          {formatRelative(inv.expiresAt)}
                        </p>
                      </div>
                      <InvitationActions invitationId={inv.id} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {users.length === 0 && invitations.length === 0 && (
            <EmptyState title="No portal users yet" description="Invite the first user for this organization." />
          )}
        </TabsContent>

        {/* Tickets */}
        <TabsContent value="tickets" className="mt-4">
          {tickets.length === 0 ? (
            <EmptyState title="No tickets for this organization" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={`/admin/tickets/${t.id}`}
                          className="hover:underline"
                        >
                          {t.ticketNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {t.subject}
                      </TableCell>
                      <TableCell>
                        <PriorityBadge
                          priorityKey={t.priority.key}
                          label={t.priority.label}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          statusKey={t.status.key}
                          label={t.status.label}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatRelative(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/tickets?organizationId=${org.id}`}>
                View all tickets
              </Link>
            </Button>
          </div>
        </TabsContent>

        {/* Assets */}
        <TabsContent value="assets" className="mt-4">
          <div className="mb-3 flex justify-end">
            <AssetDialog
              organizationId={org.id}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> Add asset
                </Button>
              }
            />
          </div>
          {assets.length === 0 ? (
            <EmptyState title="No assets recorded" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Serial / Hostname</TableHead>
                    <TableHead>Warranty</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.assetType.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.serialNumber ?? a.hostname ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.warrantyExpiry
                          ? formatDate(a.warrantyExpiry, ctx.timezone)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <AssetDialog
                            organizationId={org.id}
                            asset={a}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            }
                          />
                          <DeleteAssetButton
                            id={a.id}
                            organizationId={org.id}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="mt-4">
          {activity.length === 0 ? (
            <EmptyState title="No activity recorded" />
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {a.actor?.name ?? "System"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {a.action.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
