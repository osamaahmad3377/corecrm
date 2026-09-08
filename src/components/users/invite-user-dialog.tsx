"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  inviteClientUserAction,
  inviteInternalUserAction,
} from "@/server/actions/users";
import type { ActionState } from "@/server/actions/_helpers";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send invitation"}
    </Button>
  );
}

export function InviteUserDialog({
  kind,
  organizationId,
  triggerLabel = "Invite user",
}: {
  kind: "internal" | "client";
  organizationId?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const action =
    kind === "internal" ? inviteInternalUserAction : inviteClientUserAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Invitation sent");
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a {kind === "internal" ? "team member" : "user"}</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email to set their password and sign in.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {organizationId && (
            <input type="hidden" name="organizationId" value={organizationId} />
          )}
          <div className="space-y-2">
            <Label htmlFor="inv-name">Full name</Label>
            <Input id="inv-name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            {kind === "internal" ? (
              <Select name="internalRole" defaultValue="SUPPORT_AGENT">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPPORT_AGENT">Support Agent</SelectItem>
                  <SelectItem value="SUPPORT_MANAGER">Support Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select name="clientRole" defaultValue="CLIENT_USER">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_USER">Client User</SelectItem>
                  <SelectItem value="CLIENT_ADMIN">Client Admin</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex justify-end">
            <Submit />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
