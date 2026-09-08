"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConvertToTicketButton } from "./convert-to-ticket";
import {
  clearEmailHandledAction,
  markEmailHandledAction,
} from "@/server/actions/emails";
import { toast } from "sonner";
import { Info, EyeOff, Undo2 } from "lucide-react";

export function TriageActions({
  emailMessageId,
  handledStatus,
}: {
  emailMessageId: string;
  handledStatus: "INFO" | "IGNORED" | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        if (res.message) toast.success(res.message);
        router.refresh();
      }
    });
  }

  if (handledStatus) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {handledStatus === "INFO" ? "Marked as info" : "Ignored"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => clearEmailHandledAction(emailMessageId))}
        >
          <Undo2 className="size-3.5" /> Undo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ConvertToTicketButton emailMessageId={emailMessageId} />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => markEmailHandledAction(emailMessageId, "INFO"))}
      >
        <Info className="size-3.5" /> Mark as info
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => markEmailHandledAction(emailMessageId, "IGNORED"))}
      >
        <EyeOff className="size-3.5" /> Ignore
      </Button>
    </div>
  );
}
