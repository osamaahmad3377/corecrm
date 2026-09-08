import Link from "next/link";
import { getTicketForContext } from "@/server/services/ticket";
import { getStatuses, getPriorities } from "@/server/services/lookups";
import { assignableAgents } from "@/server/services/user";
import { prisma } from "@/server/db/client";
import type { AuthContext } from "@/server/auth/rbac";
import { can } from "@/server/auth/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatusBadge,
  PriorityBadge,
  UserAvatar,
  OrganizationBadge,
} from "@/components/badges";
import { Conversation } from "./conversation";
import { MessageComposer } from "./message-composer";
import { ActivityTimeline } from "./activity-timeline";
import { SlaPanel } from "./sla-panel";
import {
  AssigneeControl,
  PriorityControl,
  StatusControl,
  ClientTicketActions,
} from "./ticket-controls";
import { EmailClientDialog } from "./email-client-dialog";
import { formatDate, formatDateTime } from "@/lib/format";
import { FileText, Download } from "lucide-react";
import { formatBytes } from "@/lib/format";

export async function TicketDetail({
  ctx,
  ticketId,
  mode,
}: {
  ctx: AuthContext;
  ticketId: string;
  mode: "admin" | "portal";
}) {
  const ticket = await getTicketForContext(ctx, ticketId);
  const isAdmin = mode === "admin";

  const [statuses, priorities, agents, teams, emailAccounts] = await Promise.all([
    getStatuses(),
    getPriorities(),
    isAdmin && can(ctx, "ticket.assign") ? assignableAgents() : Promise.resolve([]),
    isAdmin && can(ctx, "ticket.assign")
      ? prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    isAdmin && can(ctx, "email.send")
      ? prisma.emailAccount.findMany({
          where: { status: "CONNECTED", isActive: true },
          select: { id: true, address: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const requesterName = `${ticket.requester.firstName} ${ticket.requester.lastName}`;
  const basePath = isAdmin ? "/admin/tickets" : "/portal/tickets";

  const details = (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <Detail label="Requester" value={requesterName} />
        <Detail label="Email" value={ticket.requester.email} />
        {isAdmin && (
          <Detail
            label="Organization"
            value={
              <Link
                href={`/admin/organizations/${ticket.organization.id}`}
                className="text-primary hover:underline"
              >
                {ticket.organization.name}
              </Link>
            }
          />
        )}
        <Detail
          label="Category"
          value={
            ticket.category
              ? ticket.subcategory
                ? `${ticket.category.name} / ${ticket.subcategory.name}`
                : ticket.category.name
              : "—"
          }
        />
        {ticket.service && <Detail label="Service" value={ticket.service} />}
        {ticket.asset && <Detail label="Asset" value={ticket.asset.name} />}
        {ticket.location && <Detail label="Location" value={ticket.location} />}
        {ticket.contactPhone && (
          <Detail label="Contact phone" value={ticket.contactPhone} />
        )}
        {ticket.impact && <Detail label="Impact" value={ticket.impact} />}
        {ticket.urgency && <Detail label="Urgency" value={ticket.urgency} />}
        <Detail
          label="Created"
          value={formatDateTime(ticket.createdAt, ctx.timezone)}
        />
        <Detail
          label="Updated"
          value={formatDateTime(ticket.updatedAt, ctx.timezone)}
        />
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="mb-4">
        <Link
          href={basePath}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to tickets
        </Link>
      </div>

      <div className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {ticket.ticketNumber}
            </span>
            {isAdmin && (
              <OrganizationBadge name={ticket.organization.name} />
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {ticket.subject}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PriorityBadge
            priorityKey={ticket.priority.key}
            label={ticket.priority.label}
          />
          <StatusBadge
            statusKey={ticket.status.key}
            label={ticket.status.label}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Conversation column */}
        <div className="min-w-0 space-y-4">
          {!isAdmin && (
            <ClientTicketActions
              ticketId={ticket.id}
              statusKey={ticket.status.key}
            />
          )}

          <Tabs defaultValue="conversation">
            <TabsList>
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="activity">
                Activity ({ticket.activities.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="mt-4 space-y-4">
              <Conversation
                description={ticket.description}
                descriptionAuthor={requesterName}
                descriptionDate={ticket.createdAt}
                descriptionAttachments={ticket.attachments}
                messages={ticket.messages}
                timezone={ctx.timezone}
              />
              {ticket.status.key !== "CLOSED" &&
                ticket.status.key !== "CANCELLED" && (
                  <MessageComposer
                    ticketId={ticket.id}
                    canInternalNote={ticket.canViewInternal}
                  />
                )}
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              <ActivityTimeline activities={ticket.activities} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {isAdmin && can(ctx, "ticket.changeStatus") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Manage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Status
                  </label>
                  <StatusControl
                    ticketId={ticket.id}
                    current={ticket.status.key}
                    options={statuses.map((s) => ({
                      key: s.key,
                      label: s.label,
                    }))}
                  />
                </div>
                {can(ctx, "ticket.changePriority") && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Priority
                    </label>
                    <PriorityControl
                      ticketId={ticket.id}
                      current={ticket.priority.key}
                      options={priorities.map((p) => ({
                        key: p.key,
                        label: p.label,
                      }))}
                    />
                  </div>
                )}
                {can(ctx, "ticket.assign") && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Assignee
                    </label>
                    <AssigneeControl
                      ticketId={ticket.id}
                      current={ticket.assignedAgentId}
                      currentTeam={ticket.assignedTeamId}
                      agents={agents.map((a) => ({ id: a.id, name: a.name }))}
                      teams={teams}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isAdmin && emailAccounts.length > 0 && (
            <EmailClientDialog
              ticketId={ticket.id}
              ticketNumber={ticket.ticketNumber}
              toEmail={ticket.requester.email}
              subject={ticket.subject}
              accounts={emailAccounts}
            />
          )}

          {ticket.assignedAgent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Assigned to</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <UserAvatar
                  name={ticket.assignedAgent.name}
                  image={ticket.assignedAgent.image}
                />
                <div className="text-sm">
                  <p className="font-medium">{ticket.assignedAgent.name}</p>
                  {ticket.assignedTeam && (
                    <p className="text-xs text-muted-foreground">
                      {ticket.assignedTeam.name}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">SLA</CardTitle>
            </CardHeader>
            <CardContent>
              <SlaPanel sla={ticket.sla} timezone={ctx.timezone} />
            </CardContent>
          </Card>

          {details}

          {ticket.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Attachments ({ticket.attachments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {ticket.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/api/files/${a.file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-accent"
                      >
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">
                          {a.file.filename}
                        </span>
                        <span className="text-muted-foreground">
                          {formatBytes(a.file.size)}
                        </span>
                        <Download className="size-3 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {ticket.asset && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Asset</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{ticket.asset.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ticket.asset.assetType}
                  {ticket.asset.hostname ? ` · ${ticket.asset.hostname}` : ""}
                </p>
                {ticket.asset.warrantyExpiry && (
                  <p className="text-xs text-muted-foreground">
                    Warranty:{" "}
                    {formatDate(ticket.asset.warrantyExpiry, ctx.timezone)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
