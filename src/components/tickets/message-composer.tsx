"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { addTicketMessageAction } from "@/server/actions/tickets";
import type { ActionState } from "@/server/actions/_helpers";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AttachmentUploader, type UploadedRef } from "./attachment-uploader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Lock, MessageSquare, Send } from "lucide-react";

function SubmitButton({ internalNote }: { internalNote: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      <Send className="size-4" />
      {pending
        ? "Sending…"
        : internalNote
          ? "Add internal note"
          : "Send reply"}
    </Button>
  );
}

export function MessageComposer({
  ticketId,
  canInternalNote,
}: {
  ticketId: string;
  canInternalNote: boolean;
}) {
  const action = addTicketMessageAction.bind(null, ticketId);
  const [state, formAction] = useActionState<ActionState, FormData>(
    action,
    { ok: false } as ActionState,
  );
  const [messageType, setMessageType] = useState<
    "PUBLIC_REPLY" | "INTERNAL_NOTE"
  >("PUBLIC_REPLY");
  const [attachments, setAttachments] = useState<UploadedRef[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setAttachments([]);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const isNote = messageType === "INTERNAL_NOTE";

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn(
        "rounded-lg border p-3",
        isNote && "border-warning/40 bg-warning/5",
      )}
    >
      <input type="hidden" name="messageType" value={messageType} />
      <input
        type="hidden"
        name="attachments"
        value={JSON.stringify(attachments.map((a) => ({ fileId: a.id })))}
      />

      {canInternalNote && (
        <div className="mb-2 flex gap-1 rounded-md bg-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMessageType("PUBLIC_REPLY")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 font-medium transition-colors",
              !isNote && "bg-background shadow-sm",
            )}
          >
            <MessageSquare className="size-3.5" />
            Public reply
          </button>
          <button
            type="button"
            onClick={() => setMessageType("INTERNAL_NOTE")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 font-medium transition-colors",
              isNote && "bg-background text-warning-foreground shadow-sm",
            )}
          >
            <Lock className="size-3.5" />
            Internal note
          </button>
        </div>
      )}

      <Textarea
        name="body"
        required
        rows={4}
        placeholder={
          isNote
            ? "Add a private note. The client will never see this."
            : "Write a reply to the client…"
        }
        className="resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <AttachmentUploader value={attachments} onChange={setAttachments} />
        <SubmitButton internalNote={isNote} />
      </div>
      {isNote && (
        <p className="mt-2 text-xs text-warning-foreground">
          <Lock className="mr-1 inline size-3" />
          Internal note — visible only to the support team.
        </p>
      )}
    </form>
  );
}
