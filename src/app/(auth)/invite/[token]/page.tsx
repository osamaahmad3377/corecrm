import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getInvitationByToken } from "@/server/services/invitation";
import { InviteForm } from "./invite-form";
import { ROLE_LABELS } from "@/server/auth/rbac";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation || invitation.expired) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6 text-center">
          <h2 className="text-lg font-semibold">Invitation unavailable</h2>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid, has already been used, or has
            expired. Ask your administrator to send a new one.
          </p>
          <Link
            href="/login"
            className="text-sm font-medium underline underline-offset-4"
          >
            Go to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  const roleLabel = invitation.internalRole
    ? ROLE_LABELS[invitation.internalRole]
    : invitation.clientRole
      ? ROLE_LABELS[invitation.clientRole]
      : "User";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold">Complete your account</h2>
          <p className="text-sm text-muted-foreground">
            You&apos;ve been invited as <strong>{roleLabel}</strong>
            {invitation.organization
              ? ` for ${invitation.organization.name}`
              : ""}
            .
          </p>
        </div>
        <InviteForm
          token={token}
          email={invitation.email}
          defaultName={invitation.name}
        />
      </CardContent>
    </Card>
  );
}
