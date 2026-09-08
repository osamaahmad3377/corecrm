"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  changeClientRoleAction,
} from "@/server/actions/users";
import {
  resendInvitationAction,
  revokeInvitationAction,
} from "@/server/actions/users";
import { setOrganizationStatusAction } from "@/server/actions/organizations";
import { deleteContactAction } from "@/server/actions/contacts";
import { deleteAssetAction } from "@/server/actions/assets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function OrgStatusToggle({
  id,
  status,
}: {
  id: string;
  status: "ACTIVE" | "DISABLED";
}) {
  const router = useRouter();
  const next = status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  return (
    <ConfirmDialog
      trigger={
        <Button variant={status === "ACTIVE" ? "outline" : "default"} size="sm">
          {status === "ACTIVE" ? "Disable organization" : "Enable organization"}
        </Button>
      }
      title={`${next === "DISABLED" ? "Disable" : "Enable"} this organization?`}
      description={
        next === "DISABLED"
          ? "Client users won't be able to sign in and new tickets can't be created."
          : "Client users will regain access."
      }
      destructive={next === "DISABLED"}
      confirmLabel={next === "DISABLED" ? "Disable" : "Enable"}
      onConfirm={async () => {
        const res = await setOrganizationStatusAction(id, next);
        if (res.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}

export function ClientRoleSelect({
  userId,
  organizationId,
  role,
}: {
  userId: string;
  organizationId: string;
  role: "CLIENT_ADMIN" | "CLIENT_USER";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await changeClientRoleAction(
            userId,
            organizationId,
            v as "CLIENT_ADMIN" | "CLIENT_USER",
          );
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      <SelectTrigger size="sm" className="h-8 w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="CLIENT_USER">Client User</SelectItem>
        <SelectItem value="CLIENT_ADMIN">Client Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <button
        disabled={pending}
        className="text-xs text-primary hover:underline disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const res = await resendInvitationAction(invitationId);
            if (res.ok) toast.success(res.message ?? "Resent");
            else toast.error(res.error);
          })
        }
      >
        Resend
      </button>
      <button
        disabled={pending}
        className="text-xs text-destructive hover:underline disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const res = await revokeInvitationAction(invitationId);
            if (res.ok) {
              toast.success("Revoked");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        Revoke
      </button>
    </div>
  );
}

export function DeleteContactButton({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" className="size-8">
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      }
      title="Delete this contact?"
      description="This can't be undone. Contacts linked to tickets can't be deleted."
      destructive
      confirmLabel="Delete"
      onConfirm={async () => {
        const res = await deleteContactAction(id, organizationId);
        if (res.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}

export function DeleteAssetButton({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" className="size-8">
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      }
      title="Delete this asset?"
      description="This can't be undone."
      destructive
      confirmLabel="Delete"
      onConfirm={async () => {
        const res = await deleteAssetAction(id, organizationId);
        if (res.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}
