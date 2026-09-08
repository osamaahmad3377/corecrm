import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth/context";
import { listOrganizationUsers } from "@/server/services/user";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge } from "@/components/badges";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import {
  ClientRoleSelect,
  InvitationActions,
} from "@/components/organizations/org-actions";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };

export default async function PortalUsersPage() {
  const ctx = await requireAuth();
  if (ctx.organization?.role !== "CLIENT_ADMIN") redirect("/portal");
  const orgId = ctx.organization.id;

  const [users, invitations] = await Promise.all([
    listOrganizationUsers(orgId),
    prisma.invitation.findMany({
      where: { organizationId: orgId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="People from your organization who can access this portal."
        actions={
          <InviteUserDialog
            kind="client"
            organizationId={orgId}
            triggerLabel="Invite user"
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Members ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                      {u.userId === ctx.userId ? (
                        <span className="text-sm">Client Admin (you)</span>
                      ) : (
                        <ClientRoleSelect
                          userId={u.userId}
                          organizationId={orgId}
                          role={u.role}
                        />
                      )}
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
                    <p className="text-xs text-muted-foreground">{inv.email}</p>
                  </div>
                  <InvitationActions invitationId={inv.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
