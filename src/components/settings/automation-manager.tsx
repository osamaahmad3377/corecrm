"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToneBadge } from "@/components/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ActionState } from "@/server/actions/_helpers";
import {
  createAutomationRuleAction,
  deleteAutomationRuleAction,
  runAutomationsNowAction,
  toggleAutomationRuleAction,
  updateAutomationRuleAction,
} from "@/server/actions/automations";
import {
  AUTOMATION_AUDIENCES,
  AUTOMATION_TRIGGERS,
  TIME_BASED_TRIGGERS,
} from "@/validators/automation";
import { toast } from "sonner";
import { Plus, Pencil, Play } from "lucide-react";
import { formatRelative } from "@/lib/format";

export const TRIGGER_LABELS: Record<string, string> = {
  CLIENT_ONBOARDED: "Client onboarded",
  INVITATION_REMINDER: "Invitation not accepted",
  CLIENT_USER_ACTIVATED: "Client account activated",
  TICKET_CREATED: "Ticket created",
  TICKET_ASSIGNED: "Ticket assigned",
  TICKET_AWAITING_CLIENT: "Ticket → waiting on client",
  TICKET_RESOLVED: "Ticket resolved",
  TICKET_NO_CLIENT_REPLY: "No client reply (follow-up)",
  TICKET_STALE: "Ticket stale (no activity)",
  WEEKLY_CLIENT_DIGEST: "Weekly client digest",
  CLIENT_INACTIVE: "Client user inactive",
};

const AUDIENCE_LABELS: Record<string, string> = {
  TICKET_REQUESTER: "Ticket requester",
  ORG_PRIMARY_CONTACT: "Primary contact",
  ORG_CLIENT_ADMINS: "Client admins",
  ORG_CLIENT_USERS: "All client users",
  ASSIGNED_AGENT: "Assigned agent",
  INVITED_PERSON: "The invitee",
};

interface Template {
  id: string;
  name: string;
  key: string;
}

interface Rule {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  audience: string;
  delayMinutes: number;
  thresholdDays: number;
  isActive: boolean;
  isSystem: boolean;
  lastRunAt: string | null;
  emailTemplate: { id: string; name: string; key: string };
  _count: { jobs: number };
}

interface JobRow {
  id: string;
  status: string;
  trigger: string;
  recipientEmail: string;
  scheduledFor: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  rule: { name: string };
}

function humanDelay(mins: number) {
  if (mins === 0) return "immediately";
  if (mins < 60) return `after ${mins} min`;
  const h = mins / 60;
  if (h < 24) return `after ${h % 1 ? h.toFixed(1) : h} h`;
  const d = h / 24;
  return `after ${d % 1 ? d.toFixed(1) : d} day${d === 1 ? "" : "s"}`;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function RuleDialog({
  rule,
  templates,
  trigger,
}: {
  rule?: Rule;
  templates: Template[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(rule);
  const action = editing
    ? updateAutomationRuleAction.bind(null, rule!.id)
    : createAutomationRuleAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);
  const [selectedTrigger, setSelectedTrigger] = useState(
    rule?.trigger ?? "TICKET_RESOLVED",
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
    } else if (state.error) toast.error(state.error);
  }, [state]);

  const timeBased = TIME_BASED_TRIGGERS.has(selectedTrigger);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit: ${rule!.name}` : "New automation"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="isActive" value="on" />
          <div className="space-y-2">
            <Label htmlFor="au-name">Name</Label>
            <Input id="au-name" name="name" required defaultValue={rule?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="au-desc">Description</Label>
            <Textarea
              id="au-desc"
              name="description"
              rows={2}
              defaultValue={rule?.description ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>Trigger (module)</Label>
            {editing ? (
              <Input value={TRIGGER_LABELS[rule!.trigger]} disabled />
            ) : (
              <Select
                name="trigger"
                value={selectedTrigger}
                onValueChange={setSelectedTrigger}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Email template</Label>
            <Select
              name="emailTemplateId"
              defaultValue={rule?.emailTemplate.id ?? templates[0]?.id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Send to</Label>
              <Select
                name="audience"
                defaultValue={rule?.audience ?? "TICKET_REQUESTER"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {AUDIENCE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {timeBased ? (
              <div className="space-y-2">
                <Label htmlFor="au-threshold">After how many days</Label>
                <Input
                  id="au-threshold"
                  name="thresholdDays"
                  type="number"
                  min={1}
                  defaultValue={rule?.thresholdDays ?? 3}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="au-delay">Delay (minutes)</Label>
                <Input
                  id="au-delay"
                  name="delayMinutes"
                  type="number"
                  min={0}
                  defaultValue={rule?.delayMinutes ?? 0}
                />
              </div>
            )}
            {/* keep both fields in the form */}
            {timeBased ? (
              <input
                type="hidden"
                name="delayMinutes"
                value={rule?.delayMinutes ?? 0}
              />
            ) : (
              <input
                type="hidden"
                name="thresholdDays"
                value={rule?.thresholdDays ?? 3}
              />
            )}
          </div>

          <div className="flex justify-end">
            <Submit label={editing ? "Save automation" : "Create automation"} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RuleToggle({ rule }: { rule: Rule }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Switch
      checked={rule.isActive}
      disabled={pending}
      onCheckedChange={(v) =>
        start(async () => {
          const res = await toggleAutomationRuleAction(rule.id, v);
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    />
  );
}

export function AutomationManager({
  rules,
  templates,
  jobs,
}: {
  rules: Rule[];
  templates: Template[];
  jobs: JobRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">
            Automations ({rules.filter((r) => r.isActive).length} active)
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await runAutomationsNowAction();
                  if (res.ok) toast.success(res.message ?? "Done");
                  else toast.error(res.error);
                  router.refresh();
                })
              }
            >
              <Play className="size-4" /> Run now
            </Button>
            <RuleDialog
              templates={templates}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> New automation
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {r.name}
                    <ToneBadge tone={r.isSystem ? "info" : "primary"}>
                      {TRIGGER_LABELS[r.trigger] ?? r.trigger}
                    </ToneBadge>
                    {!r.isActive && <ToneBadge tone="neutral">Off</ToneBadge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.description}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sends <span className="font-medium">{r.emailTemplate.name}</span>{" "}
                    to {AUDIENCE_LABELS[r.audience]} ·{" "}
                    {TIME_BASED_TRIGGERS.has(r.trigger)
                      ? `after ${r.thresholdDays} day${r.thresholdDays === 1 ? "" : "s"}`
                      : humanDelay(r.delayMinutes)}{" "}
                    · {r._count.jobs} sent
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RuleToggle rule={r} />
                  <RuleDialog
                    rule={r}
                    templates={templates}
                    trigger={
                      <Button variant="ghost" size="icon" className="size-8">
                        <Pencil className="size-3.5" />
                      </Button>
                    }
                  />
                  {!r.isSystem && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          Delete
                        </Button>
                      }
                      title="Delete this automation?"
                      destructive
                      confirmLabel="Delete"
                      onConfirm={async () => {
                        const res = await deleteAutomationRuleAction(r.id);
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent automation emails</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing sent yet. Automations run on a schedule (every 15 minutes
              in production) — use “Run now” to trigger a pass.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{j.rule.name}</span>{" "}
                    <span className="text-muted-foreground">
                      → {j.recipientEmail}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ToneBadge
                      tone={
                        j.status === "SENT"
                          ? "success"
                          : j.status === "FAILED"
                            ? "destructive"
                            : j.status === "SKIPPED"
                              ? "neutral"
                              : "warning"
                      }
                    >
                      {j.status}
                    </ToneBadge>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(j.sentAt ?? j.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
