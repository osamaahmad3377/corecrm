"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  adminResetPasswordAction,
  changeInternalRoleAction,
  setInternalUserStatusAction,
} from "@/server/actions/users";
import { toast } from "sonner";

type Role = "SUPER_ADMIN" | "ADMIN" | "SUPPORT_MANAGER" | "SUPPORT_AGENT";

export function InternalRoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select
      value={role}
      disabled={pending || disabled}
      onValueChange={(v) =>
        start(async () => {
          const res = await changeInternalRoleAction(userId, v as Role);
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      <SelectTrigger size="sm" className="h-8 w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SUPPORT_AGENT">Support Agent</SelectItem>
        <SelectItem value="SUPPORT_MANAGER">Support Manager</SelectItem>
        <SelectItem value="ADMIN">Admin</SelectItem>
        <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ResetPasswordButton({
  userId,
  label = "Send reset",
}: {
  userId: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await adminResetPasswordAction(userId);
          if (res.ok) toast.success(res.message ?? "Reset email sent");
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Sending…" : label}
    </Button>
  );
}

export function InternalStatusToggle({
  userId,
  status,
  disabled,
}: {
  userId: string;
  status: "ACTIVE" | "DISABLED" | "INVITED";
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (status === "INVITED") {
    return <span className="text-xs text-muted-foreground">Invited</span>;
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await setInternalUserStatusAction(
            userId,
            status === "ACTIVE" ? "DISABLED" : "ACTIVE",
          );
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      {status === "ACTIVE" ? "Disable" : "Enable"}
    </Button>
  );
}
