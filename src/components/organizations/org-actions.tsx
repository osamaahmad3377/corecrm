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
import {
  deleteOrganizationAction,
  setOrganizationStatusAction,
} from "@/server/actions/organizations";
import { impersonateOrgAction } from "@/server/actions/impersonation";
import { Input } from "@/components/ui/input";
import { Eye } from "lucide-react";
import { useState } from "react";
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

export function ViewAsClientButton({ organizationId }: { organizationId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(() => impersonateOrgAction(organizationId))}
    >
      <Eye className="size-4" /> {pending ? "Opening…" : "View as client"}
    </Button>
  );
}

export function DeleteOrgButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <h2 className="text-base font-semibold text-destructive">
              Delete {name}?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This permanently removes the organization and{" "}
              <strong>every ticket, conversation, contact, asset and email
              thread</strong> under it. Client users belonging only to this
              organization are also deleted. This cannot be undone.
            </p>
            <p className="mt-3 text-sm">
              Type <strong>{name}</strong> to confirm:
            </p>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1.5"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending || value !== name}
                onClick={() =>
                  start(async () => {
                    const res = await deleteOrganizationAction(id, value);
                    if (!res.ok) toast.error(res.error);
                  })
                }
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
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
