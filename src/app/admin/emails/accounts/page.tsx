import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/context";
import { listEmailAccounts } from "@/server/services/email-account";
import { prisma } from "@/server/db/client";
import { features } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/states";
import { ToneBadge } from "@/components/badges";
import {
  ConnectButton,
  SyncButton,
  DisconnectButton,
} from "@/components/emails/account-controls";
import { AccountSettingsForm } from "@/components/emails/account-settings-form";
import { formatRelative } from "@/lib/format";
import { Info, Mail } from "lucide-react";

export const metadata: Metadata = { title: "Email accounts" };

export default async function EmailAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  await requirePermission("email.account.manage");
  const sp = await searchParams;

  const [accounts, organizations, teams] = await Promise.all([
    listEmailAccounts(),
    prisma.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const anyProviderConfigured = features.microsoftEmail || features.googleEmail;

  return (
    <>
      <PageHeader
        title="Email accounts"
        description="Connect support mailboxes with OAuth. Passwords are never entered or stored."
      />

      {sp.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Connection failed</AlertTitle>
          <AlertDescription>{sp.error}</AlertDescription>
        </Alert>
      )}
      {sp.connected && (
        <Alert className="mb-4">
          <AlertTitle>Mailbox connected</AlertTitle>
          <AlertDescription>{sp.connected} is now syncing.</AlertDescription>
        </Alert>
      )}

      {!anyProviderConfigured && (
        <Alert className="mb-4">
          <Info className="size-4" />
          <AlertTitle>Provider credentials not configured</AlertTitle>
          <AlertDescription>
            Set <code>MICROSOFT_CLIENT_ID/SECRET</code> or{" "}
            <code>GOOGLE_CLIENT_ID/SECRET</code> in the environment to enable
            connecting mailboxes. See <code>docs/EMAIL_INTEGRATION.md</code>.
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Connect a mailbox</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <ConnectButton
            provider="microsoft"
            label="Connect Microsoft 365"
            disabled={!features.microsoftEmail}
          />
          <ConnectButton
            provider="google"
            label="Connect Google Workspace"
            disabled={!features.googleEmail}
          />
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No mailboxes connected"
          description="Connect support@, helpdesk@ or it@ to start receiving email as tickets."
        />
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {a.displayName}
                    <ToneBadge
                      tone={
                        a.status === "CONNECTED"
                          ? "success"
                          : a.status === "ERROR"
                            ? "destructive"
                            : "neutral"
                      }
                    >
                      {a.status}
                    </ToneBadge>
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.address} · {a.provider === "MICROSOFT" ? "Microsoft 365" : "Google Workspace"}
                    {a.lastSyncedAt
                      ? ` · synced ${formatRelative(a.lastSyncedAt)}`
                      : " · never synced"}
                    {" · "}
                    {a._count.messages} messages
                  </p>
                  {a.lastError && (
                    <p className="mt-1 text-xs text-destructive">{a.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {a.status === "CONNECTED" && <SyncButton id={a.id} />}
                  <DisconnectButton id={a.id} />
                </div>
              </CardHeader>
              <CardContent>
                <AccountSettingsForm
                  account={{
                    id: a.id,
                    displayName: a.displayName,
                    scope: a.scope,
                    organizationId: a.organizationId,
                    teamId: a.teamId,
                    isActive: a.isActive,
                  }}
                  organizations={organizations}
                  teams={teams}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
