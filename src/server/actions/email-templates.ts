"use server";

import { z } from "zod";
import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import {
  createTemplate,
  deleteTemplate,
  resetTemplate,
  updateTemplate,
} from "@/server/services/email-template";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string().trim().min(1).max(50000),
});

export async function createTemplateAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  const parsed = schema.safeParse({
    name: fd.get("name") ?? "",
    description: fd.get("description") ?? "",
    subject: fd.get("subject") ?? "",
    bodyHtml: fd.get("bodyHtml") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await createTemplate(ctx, parsed.data, meta);
    return { message: "Template created", revalidate: ["/admin/settings/templates"] };
  });
}

export async function updateTemplateAction(
  id: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  const parsed = schema.safeParse({
    name: fd.get("name") ?? "",
    description: fd.get("description") ?? "",
    subject: fd.get("subject") ?? "",
    bodyHtml: fd.get("bodyHtml") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await updateTemplate(ctx, id, parsed.data, meta);
    return { message: "Template saved", revalidate: ["/admin/settings/templates"] };
  });
}

export async function resetTemplateAction(id: string): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await resetTemplate(ctx, id, meta);
    return { message: "Reset to default", revalidate: ["/admin/settings/templates"] };
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionState> {
  const ctx = await requirePermission("emailTemplate.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await deleteTemplate(ctx, id, meta);
    return { revalidate: ["/admin/settings/templates"] };
  });
}
