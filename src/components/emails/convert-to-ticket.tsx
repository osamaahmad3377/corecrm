"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { convertEmailToTicketAction } from "@/server/actions/emails";
import { toast } from "sonner";
import { TicketPlus } from "lucide-react";

export function ConvertToTicketButton({ emailMessageId }: { emailMessageId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await convertEmailToTicketAction(emailMessageId);
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      <TicketPlus className="size-4" />
      {pending ? "Creating…" : "Create ticket"}
    </Button>
  );
}
