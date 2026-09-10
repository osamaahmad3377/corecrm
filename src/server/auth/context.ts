import "server-only";
import { headers } from "next/headers";
import type { InternalRole } from "@prisma/client";
import { auth } from "./index";
import { AuthContext, can, hasInternalRank, Permission } from "./rbac";
import { AppError, forbidden, unauthorized } from "@/lib/errors";
import { readImpersonation } from "./impersonation";

/**
 * Resolve the acting user from the session. Organization access is derived here
 * from the authenticated session — never from request input.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = session.user;
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    isInternal: u.isInternal,
    internalRole: u.internalRole,
    organization: u.organizationId
      ? { id: u.organizationId, role: u.organizationRole! }
      : null,
    timezone: u.timezone || "UTC",
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorized();
  return ctx;
}

export async function requireInternal(
  min: InternalRole = "SUPPORT_AGENT",
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.isInternal || !ctx.internalRole) throw forbidden();
  if (!hasInternalRank(ctx, min)) throw forbidden();
  return ctx;
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!can(ctx, permission)) throw forbidden();
  return ctx;
}

/**
 * Ensure the caller may act within `organizationId`.
 * - Internal users with `ticket.viewAll`/`org.viewAll` may access any org.
 * - Client users may only access their own organization.
 */
export async function requireOrgAccess(
  organizationId: string,
  opts?: { write?: boolean },
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.isInternal) {
    // Agents and above can read every org; writes still gated per-action.
    return ctx;
  }
  if (!ctx.organization || ctx.organization.id !== organizationId) {
    throw forbidden();
  }
  if (opts?.write && ctx.organization.role !== "CLIENT_ADMIN") {
    // Most client writes (ticket create/reply) are allowed for CLIENT_USER;
    // callers that need admin-only writes pass { write: true }.
    throw forbidden();
  }
  return ctx;
}

/**
 * Run a page-level guard; if it fails with a 401/403, render the app's 404 page
 * instead of a 500 (and don't reveal that the resource exists). Use in page
 * components: `const ctx = await guardPage(() => requirePermission("org.create"));`
 */
export async function guardPage<T>(fn: () => Promise<T>): Promise<T> {
  const { notFound: nextNotFound } = await import("next/navigation");
  try {
    return await fn();
  } catch (e) {
    if (
      e instanceof AppError &&
      (e.code === "FORBIDDEN" || e.code === "UNAUTHENTICATED")
    ) {
      nextNotFound();
    }
    throw e;
  }
}

/**
 * Auth context for the CLIENT PORTAL. Real client users pass through unchanged.
 * An internal user with a valid "view as client" cookie is returned as a
 * `CLIENT_USER` of the viewed org (with `viewingAsClient: true`) so every
 * client-facing service scopes exactly as it would for a real client. Internal
 * users without the cookie are rejected — the portal layout redirects them.
 */
export async function requirePortalAuth(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.isInternal) {
    if (!ctx.organization) throw forbidden();
    return ctx;
  }
  if (!can(ctx, "org.impersonate")) throw forbidden();
  const viewing = await readImpersonation(ctx.userId);
  if (!viewing) throw forbidden();
  return {
    ...ctx,
    isInternal: false,
    internalRole: null,
    organization: { id: viewing.id, role: "CLIENT_USER" },
    viewingAsClient: true,
  };
}

/** Client IP + UA for audit logging. Best-effort behind Vercel's proxy. */
export async function requestMeta(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  return { ipAddress: ip, userAgent: h.get("user-agent") };
}
