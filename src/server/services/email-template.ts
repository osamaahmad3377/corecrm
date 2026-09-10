import "server-only";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";
import { conflict, notFound, validationError } from "@/lib/errors";
import { APP_NAME } from "@/lib/constants";
import { htmlToText } from "@/lib/sanitize";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { layout } from "@/server/email-templates";
import {
  SYSTEM_TEMPLATES,
  findSystemTemplate,
} from "@/server/email-templates/registry";
import { recordAudit } from "./audit";

type Meta = { ipAddress?: string | null; userAgent?: string | null };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Replace {{var}} tokens; unknown/undefined → "". */
function interpolate(input: string, vars: Record<string, unknown>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key] ?? (key === "appName" ? APP_NAME : "");
    return String(v);
  });
}

interface RenderInput {
  key: string;
  subject: string;
  bodyHtml: string;
  name: string;
}

function renderFrom(
  input: RenderInput,
  vars: Record<string, unknown>,
): RenderedEmail {
  const fallback = findSystemTemplate(input.key);
  const ctaVar = fallback?.ctaVar;
  const ctaLabel = fallback?.ctaLabel;

  const subject = interpolate(input.subject, vars);
  const bodyHtml = interpolate(input.bodyHtml, vars);
  const heading = interpolate(input.name, vars);

  const cta =
    ctaVar && vars[ctaVar]
      ? { label: ctaLabel ?? "Open", url: String(vars[ctaVar]) }
      : undefined;

  const { html, text } = layout({
    heading,
    bodyHtml,
    bodyText: htmlToText(bodyHtml),
    cta,
  });
  return { subject, html, text };
}

/**
 * Render a transactional email by template key. Uses the admin-editable DB row
 * when present, otherwise the built-in default from the registry.
 */
export async function renderTemplate(
  key: string,
  vars: Record<string, unknown>,
): Promise<RenderedEmail> {
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  const fallback = findSystemTemplate(key);
  return renderFrom(
    {
      key,
      subject: row?.subject ?? fallback?.subject ?? "{{appName}}",
      bodyHtml: row?.bodyHtml ?? fallback?.body ?? "<p>{{appName}}</p>",
      name: row?.name ?? fallback?.name ?? APP_NAME,
    },
    vars,
  );
}

/** Render a specific template row (used by the automation engine). */
export async function renderTemplateById(
  id: string,
  vars: Record<string, unknown>,
): Promise<RenderedEmail | null> {
  const row = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!row || !row.isActive) return null;
  return renderFrom(
    { key: row.key, subject: row.subject, bodyHtml: row.bodyHtml, name: row.name },
    vars,
  );
}

// --- Admin management -------------------------------------------------

export async function listTemplates() {
  const rows = await prisma.emailTemplate.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { updatedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    ...r,
    variables: findSystemTemplate(r.key)?.variables ?? [],
  }));
}

export async function getTemplate(id: string) {
  const row = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!row) throw notFound("Template not found");
  return { ...row, variables: findSystemTemplate(row.key)?.variables ?? [] };
}

const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

export async function createTemplate(
  ctx: AuthContext,
  input: { name: string; description?: string; subject: string; bodyHtml: string },
  meta?: Meta,
) {
  const key = `CUSTOM_${slug(input.name)}` || `CUSTOM_${Date.now()}`;
  const existing = await prisma.emailTemplate.findUnique({ where: { key } });
  if (existing) throw conflict("A template with a similar name already exists");

  const row = await prisma.emailTemplate.create({
    data: {
      key,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      subject: input.subject.trim(),
      bodyHtml: sanitizeEmailHtml(input.bodyHtml),
      isSystem: false,
      updatedById: ctx.userId,
    },
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "emailTemplate",
    entityId: row.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { createdTemplate: key },
  });
  return row;
}

export async function updateTemplate(
  ctx: AuthContext,
  id: string,
  input: { name: string; description?: string; subject: string; bodyHtml: string; isActive?: boolean },
  meta?: Meta,
) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) throw notFound("Template not found");
  if (!input.subject.trim() || !input.bodyHtml.trim()) {
    throw validationError("Subject and body are required");
  }
  const row = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      subject: input.subject.trim(),
      bodyHtml: sanitizeEmailHtml(input.bodyHtml),
      isActive: input.isActive ?? existing.isActive,
      updatedById: ctx.userId,
    },
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "emailTemplate",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { updatedTemplate: existing.key },
  });
  return row;
}

export async function resetTemplate(ctx: AuthContext, id: string, meta?: Meta) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) throw notFound("Template not found");
  const def = findSystemTemplate(existing.key);
  if (!def) throw validationError("Only built-in templates can be reset");
  const row = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: def.name,
      description: def.description,
      subject: def.subject,
      bodyHtml: def.body,
      isActive: true,
      updatedById: ctx.userId,
    },
  });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "emailTemplate",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { resetTemplate: existing.key },
  });
  return row;
}

export async function deleteTemplate(ctx: AuthContext, id: string, meta?: Meta) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) throw notFound("Template not found");
  if (existing.isSystem) {
    throw conflict("Built-in templates can't be deleted — reset them instead");
  }
  await prisma.emailTemplate.delete({ where: { id } });
  await recordAudit({
    action: "SETTINGS_UPDATED",
    entityType: "emailTemplate",
    entityId: id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { deletedTemplate: existing.key },
  });
}

/** Ensure a DB row exists for every system template (idempotent). */
export async function ensureSystemTemplates() {
  for (const def of SYSTEM_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        name: def.name,
        description: def.description,
        subject: def.subject,
        bodyHtml: def.body,
        isSystem: true,
      },
      update: {}, // don't clobber admin edits
    });
  }
}
