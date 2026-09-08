import type { Metadata } from "next";
import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { listInternalUsers } from "@/server/services/user";
import { listTeams } from "@/server/services/team";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ResetPasswordButton,
} from "@/components/users/internal-user-controls";
import { InvitationActions } from "@/components/organizations/org-actions";
import { TeamManager } from "@/components/teams/team-manager";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  const manageUsers = can(ctx, "internal.users.manage");
  const manageTeams = can(ctx, "team.manage");
  const canResetPw = can(ctx, "user.resetPassword");

  const [users, teams, invitations, activeStaff] = await Promise.all([
    listInternalUsers({}),
    listTeams(),
    prisma.invitation.findMany({
      where: { status: "PENDING", internalRole: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { isInternal: true, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
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
                  <TableHead>Assigned</TableHead>
                  <TableHead>Last login</TableHead>
                  {(manageUsers || canResetPw) && <TableHead />}
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
                          {u.internalRole ? ROLE_LABELS[u.internalRole] : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {u._count.assignedTickets}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}
                    </TableCell>
                    {(manageUsers || canResetPw) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canResetPw && u.id !== ctx.userId && (
                            <ResetPasswordButton userId={u.id} />
                          )}
                          {manageUsers && u.id !== ctx.userId && (
                            <InternalStatusToggle
                              userId={u.id}
                              status={u.status}
                            />
                          )}
                        </div>
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

      <div className="mt-4">
        <TeamManager teams={teams} staff={activeStaff} canManage={manageTeams} />
      </div>
    </>
  );
}
