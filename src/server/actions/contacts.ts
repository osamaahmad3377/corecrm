"use server";

import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import { contactInputSchema } from "@/validators/contact";
import {
  createContact,
  deleteContact,
  updateContact,
} from "@/server/services/contact";

function readContact(fd: FormData) {
  return contactInputSchema.safeParse({
    firstName: fd.get("firstName") ?? "",
    lastName: fd.get("lastName") ?? "",
    email: fd.get("email") ?? "",
    phone: fd.get("phone") ?? "",
    position: fd.get("position") ?? "",
    notes: fd.get("notes") ?? "",
    isPrimary: fd.get("isPrimary") === "on",
  });
}

export async function createContactAction(
  organizationId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("contact.manage");
  const parsed = readContact(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await createContact(ctx, organizationId, parsed.data, meta);
    return {
      message: "Contact added",
      revalidate: [
        `/admin/organizations/${organizationId}`,
        "/admin/contacts",
      ],
    };
  });
}

export async function updateContactAction(
  id: string,
  organizationId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("contact.manage");
  const parsed = readContact(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await updateContact(ctx, id, parsed.data, meta);
    return {
      message: "Saved",
      revalidate: [
        `/admin/organizations/${organizationId}`,
        "/admin/contacts",
      ],
    };
  });
}

export async function deleteContactAction(
  id: string,
  organizationId: string,
): Promise<ActionState> {
  const ctx = await requirePermission("contact.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await deleteContact(ctx, id, meta);
    return {
      revalidate: [
        `/admin/organizations/${organizationId}`,
        "/admin/contacts",
      ],
    };
  });
}
