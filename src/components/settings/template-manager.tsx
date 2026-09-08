"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
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
import { Card, CardContent } from "@/components/ui/card";
import { ToneBadge } from "@/components/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ActionState } from "@/server/actions/_helpers";
import {
  createTemplateAction,
  deleteTemplateAction,
  resetTemplateAction,
  updateTemplateAction,
} from "@/server/actions/email-templates";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

interface Template {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string;
  bodyHtml: string;
  isSystem: boolean;
  isActive: boolean;
  variables: string[];
  updatedBy?: { name: string } | null;
  updatedAt: string | Date;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function TemplateDialog({
  template,
  trigger,
}: {
  template?: Template;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(template);
  const action = editing
    ? updateTemplateAction.bind(null, template!.id)
    : createTemplateAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
    } else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit: ${template!.name}` : "New email template"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                name="name"
                required
                defaultValue={template?.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Input
                id="tpl-desc"
                name="description"
                defaultValue={template?.description ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-subject">Subject</Label>
            <Input
              id="tpl-subject"
              name="subject"
              required
              defaultValue={template?.subject}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">Body (HTML)</Label>
            <Textarea
              id="tpl-body"
              name="bodyHtml"
              required
              rows={9}
              className="font-mono text-xs"
              defaultValue={template?.bodyHtml}
            />
          </div>
          {template && template.variables.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Available variables:{" "}
              {template.variables.map((v) => (
                <code
                  key={v}
                  className="mr-1 rounded bg-muted px-1 py-0.5"
                >{`{{${v}}}`}</code>
              ))}
              <code className="rounded bg-muted px-1 py-0.5">{`{{appName}}`}</code>
            </p>
          )}
          <div className="flex justify-end">
            <Submit label={editing ? "Save template" : "Create template"} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Transactional emails sent by the system. Built-in templates can be
            edited or reset; you can also add your own.
          </p>
          <TemplateDialog
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> New template
              </Button>
            }
          />
        </div>
        <ul className="divide-y">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-start justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {t.name}
                  {t.isSystem ? (
                    <ToneBadge tone="info">Built-in</ToneBadge>
                  ) : (
                    <ToneBadge tone="primary">Custom</ToneBadge>
                  )}
                </p>
                {t.description && (
                  <p className="text-xs text-muted-foreground">
                    {t.description}
                  </p>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  Subject: {t.subject}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <TemplateDialog
                  template={t}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                  }
                />
                {t.isSystem ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        Reset
                      </Button>
                    }
                    title="Reset this template?"
                    description="This restores the built-in default subject and body, discarding your changes."
                    confirmLabel="Reset"
                    onConfirm={async () => {
                      const res = await resetTemplateAction(t.id);
                      if (res.ok) {
                        router.refresh();
                        return { ok: true };
                      }
                      return { ok: false, error: res.error };
                    }}
                  />
                ) : (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        Delete
                      </Button>
                    }
                    title="Delete this template?"
                    description="This can't be undone."
                    destructive
                    confirmLabel="Delete"
                    onConfirm={async () => {
                      const res = await deleteTemplateAction(t.id);
                      if (res.ok) {
                        router.refresh();
                        return { ok: true };
                      }
                      return { ok: false, error: res.error };
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
