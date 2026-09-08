"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  disconnectEmailAccountAction,
  syncEmailAccountAction,
} from "@/server/actions/emails";
import { toast } from "sonner";
import { RefreshCw, Unplug } from "lucide-react";

export function ConnectButton({
  provider,
  label,
  disabled,
}: {
  provider: "microsoft" | "google";
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      asChild={!disabled}
      variant="outline"
      disabled={disabled}
      title={disabled ? "Configure the provider credentials on the server first" : undefined}
    >
      {disabled ? (
        <span>{label}</span>
      ) : (
        <a href={`/api/emails/accounts/connect/${provider}`}>{label}</a>
      )}
    </Button>
  );
}

export function SyncButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await syncEmailAccountAction(id);
          if (res.ok) {
            toast.success(res.message ?? "Synced");
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      Sync now
    </Button>
  );
}

export function DisconnectButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          <Unplug className="size-4" /> Disconnect
        </Button>
      }
      title="Disconnect this mailbox?"
      description="Stored OAuth tokens are deleted and revoked. Historic emails stay linked to their tickets."
      destructive
      confirmLabel="Disconnect"
      onConfirm={async () => {
        const res = await disconnectEmailAccountAction(id);
        if (res.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}
