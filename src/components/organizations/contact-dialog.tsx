"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createContactAction,
  updateContactAction,
} from "@/server/actions/contacts";
import type { ActionState } from "@/server/actions/_helpers";
import { toast } from "sonner";

interface ContactData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string | null;
  notes: string | null;
  isPrimary: boolean;
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save contact" : "Add contact"}
    </Button>
  );
}

export function ContactDialog({
  organizationId,
  contact,
  trigger,
}: {
  organizationId: string;
  contact?: ContactData;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(contact);
  const action = editing
    ? updateContactAction.bind(null, contact!.id, organizationId)
    : createContactAction.bind(null, organizationId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-first">First name</Label>
            <Input
              id="c-first"
              name="firstName"
              required
              defaultValue={contact?.firstName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-last">Last name</Label>
            <Input
              id="c-last"
              name="lastName"
              required
              defaultValue={contact?.lastName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              name="email"
              type="email"
              required
              defaultValue={contact?.email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" name="phone" defaultValue={contact?.phone ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-position">Position</Label>
            <Input
              id="c-position"
              name="position"
              defaultValue={contact?.position ?? ""}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea
              id="c-notes"
              name="notes"
              rows={2}
              defaultValue={contact?.notes ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox name="isPrimary" defaultChecked={contact?.isPrimary} />
            Primary contact for this organization
          </label>
          <div className="flex justify-end sm:col-span-2">
            <Submit editing={editing} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
