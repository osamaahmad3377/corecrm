"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendSupportEmailAction } from "@/server/actions/emails";
import type { ActionState } from "@/server/actions/_helpers";
import { toast } from "sonner";
import { Mail } from "lucide-react";

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send email"}
    </Button>
  );
}

export function EmailClientDialog({
  ticketId,
  ticketNumber,
  toEmail,
  subject,
  accounts,
}: {
  ticketId: string;
  ticketNumber: string;
  toEmail: string;
  subject: string;
  accounts: { id: string; address: string; displayName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(
    sendSupportEmailAction,
    { ok: false } as ActionState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Email sent");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (accounts.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Mail className="size-4" /> Email client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email the client</DialogTitle>
          <DialogDescription>
            Sends from a connected support mailbox and adds the message to this
            ticket&apos;s conversation.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="ticketId" value={ticketId} />
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select name="emailAccountId" defaultValue={accounts[0].id}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.displayName} — {a.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-to">To</Label>
            <Input id="ec-to" name="to" defaultValue={toEmail} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-cc">Cc</Label>
            <Input id="ec-cc" name="cc" placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-subject">Subject</Label>
            <Input
              id="ec-subject"
              name="subject"
              defaultValue={`[${ticketNumber}] ${subject}`}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-body">Message</Label>
            <Textarea id="ec-body" name="body" rows={6} required />
          </div>
          <div className="flex justify-end">
            <Send />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
