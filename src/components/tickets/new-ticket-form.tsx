"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createInternalTicketAction,
  createPortalTicketAction,
} from "@/server/actions/tickets";
import type { ActionState } from "@/server/actions/_helpers";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AttachmentUploader,
  type UploadedRef,
} from "./attachment-uploader";
import { AlertCircle, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface Props {
  mode: "portal" | "internal";
  categories: Category[];
  priorities: { key: string; label: string }[];
  assets: { id: string; name: string }[];
  organizations?: { id: string; name: string }[];
  contactsByOrg?: Record<string, { id: string; name: string; email: string }[]>;
  agents?: { id: string; name: string }[];
}

function SubmitButton({ mode }: { mode: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Submitting…" : mode === "portal" ? "Submit ticket" : "Create ticket"}
    </Button>
  );
}

export function NewTicketForm({
  mode,
  categories,
  priorities,
  assets,
  organizations = [],
  contactsByOrg = {},
  agents = [],
}: Props) {
  const action =
    mode === "portal" ? createPortalTicketAction : createInternalTicketAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  const [attachments, setAttachments] = useState<UploadedRef[]>([]);
  const [showOptional, setShowOptional] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [orgId, setOrgId] = useState<string>(organizations[0]?.id ?? "");

  const parents = categories.filter((c) => !c.parentId);
  const subcategories = useMemo(
    () => categories.filter((c) => c.parentId === categoryId),
    [categories, categoryId],
  );
  const contacts = contactsByOrg[orgId] ?? [];

  useEffect(() => {
    if (!state.ok && state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <input
        type="hidden"
        name="attachments"
        value={JSON.stringify(attachments.map((a) => ({ fileId: a.id })))}
      />

      {mode === "internal" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Organization</Label>
            <Select name="organizationId" value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Requester contact</Label>
            <Select name="requesterContactId">
              <SelectTrigger>
                <SelectValue placeholder="Select contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No contacts for this organization
                  </div>
                )}
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          required
          placeholder="Short summary of the problem"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={6}
          placeholder="What happened? What have you tried? When did it start?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={categoryId}
            onValueChange={(v) => setCategoryId(v)}
            name="categoryId"
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {parents.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {subcategories.length > 0 && (
          <div className="space-y-2">
            <Label>Subcategory</Label>
            <Select name="subcategoryId">
              <SelectTrigger>
                <SelectValue placeholder="Select a subcategory" />
              </SelectTrigger>
              <SelectContent>
                {subcategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Priority</Label>
          <Select name="priorityKey" defaultValue="MEDIUM">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {priorities.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {assets.length > 0 && (
          <div className="space-y-2">
            <Label>Affected asset / device</Label>
            <Select name="assetId">
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {mode === "internal" && agents.length > 0 && (
        <div className="space-y-2">
          <Label>Assign to agent (optional)</Label>
          <Select name="assignedAgentId">
            <SelectTrigger>
              <SelectValue placeholder="Leave unassigned" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowOptional((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={`size-4 transition-transform ${showOptional ? "rotate-180" : ""}`}
        />
        Additional details
      </button>

      {showOptional && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="service">Service</Label>
            <Input id="service" name="service" placeholder="e.g. Email, VPN" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" placeholder="Office / site" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input id="contactPhone" name="contactPhone" />
          </div>
          <div className="space-y-2">
            <Label>Preferred contact method</Label>
            <Select name="preferredContactMethod">
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="PHONE">Phone</SelectItem>
                <SelectItem value="PORTAL">Portal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Impact</Label>
            <Select name="impact">
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low — just me</SelectItem>
                <SelectItem value="MEDIUM">Medium — my team</SelectItem>
                <SelectItem value="HIGH">High — whole organization</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Urgency</Label>
            <Select name="urgency">
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Attachments</Label>
        <AttachmentUploader value={attachments} onChange={setAttachments} />
        <p className="text-xs text-muted-foreground">
          Screenshots, logs, PDFs and documents up to 20&nbsp;MB each.
        </p>
      </div>

      <SubmitButton mode={mode} />
    </form>
  );
}
