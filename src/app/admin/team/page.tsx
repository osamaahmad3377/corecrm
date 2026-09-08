import type { Metadata } from "next";
import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { listInternalUsers } from "@/server/services/user";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states";
import { ToneBadge, UserAvatar } from "@/components/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import {
  InternalRoleSelect,
  InternalStatusToggle,
} from "@/components/users/internal-user-controls";
import { InvitationActions } from "@/components/organizations/org-actions";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  const manageUsers = can(ctx, "internal.users.manage");

  const [users, teams, invitations] = await Promise.all([
    listInternalUsers({}),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true, tickets: true } },
        members: { include: { user: { select: { name: true } } } },
      },
    }),
    prisma.invitation.findMany({
      where: { status: "PENDING", internalRole: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Team"
        description="Internal staff, roles and support teams."
        actions={
          manageUsers && <InviteUserDialog kind="internal" triggerLabel="Invite team member" />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Staff ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned tickets</TableHead>
                  <TableHead>Last login</TableHead>
                  {manageUsers && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={u.name} />
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.email}
                          </p>
                        </div>
                        {u.status === "DISABLED" && (
                          <ToneBadge tone="neutral">Disabled</ToneBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {manageUsers && u.id !== ctx.userId ? (
                        <InternalRoleSelect
                          userId={u.id}
                          role={u.internalRole ?? "SUPPORT_AGENT"}
                        />
                      ) : (
                        <span className="text-sm">
                          {u.internalRole
                            ? ROLE_LABELS[u.internalRole]
                            : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {u._count.assignedTickets}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}
                    </TableCell>
                    {manageUsers && (
                      <TableCell className="text-right">
                        {u.id !== ctx.userId && (
                          <InternalStatusToggle
                            userId={u.id}
                            status={u.status}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card className="mt-4">
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
                      {inv.email} ·{" "}
                      {inv.internalRole ? ROLE_LABELS[inv.internalRole] : ""}
                    </p>
                  </div>
                  <InvitationActions invitationId={inv.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Support teams</CardTitle>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <EmptyState title="No teams yet" description="Teams can be created from Settings." />
          ) : (
            <ul className="divide-y">
              {teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.members.map((m) => m.user.name).join(", ") || "No members"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t._count.members} members · {t._count.tickets} tickets
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
