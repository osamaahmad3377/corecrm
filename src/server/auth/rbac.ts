import type { ClientRole, InternalRole } from "@prisma/client";

/**
 * Role-based access control. `can()` is the single decision point; UI hiding is
 * never the control. Every server action / route handler resolves an
 * {@link AuthContext} and calls `can()` (or a `require*` guard) before acting.
 */

export type Role = InternalRole | ClientRole;

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  isInternal: boolean;
  internalRole: InternalRole | null;
  /** Present for client users, or for internal staff currently "viewing as client". */
  organization: { id: string; role: ClientRole } | null;
  timezone: string;
  /**
   * Set when internal staff are impersonating a client org via the portal.
   * In that mode `isInternal` is reported as `false` and `organization` is the
   * viewed org, so client-facing services scope correctly.
   */
  viewingAsClient?: boolean;
}

export type Permission =
  // internal administration
  | "internal.users.manage"
  | "internal.settings.manage"
  | "internal.audit.view"
  | "org.create"
  | "org.update"
  | "org.disable"
  | "org.viewAll"
  | "org.delete"
  | "org.impersonate" // "view as client" / open the client portal
  | "contact.manage"
  | "asset.manage"
  | "team.manage"
  | "ticketConfig.manage" // categories / priorities / statuses / SLA
  | "emailTemplate.manage"
  | "user.resetPassword" // admin-initiated password reset for any user
  | "reports.view"
  // tickets
  | "ticket.viewAll"
  | "ticket.create"
  | "ticket.assign"
  | "ticket.changeStatus"
  | "ticket.changePriority"
  | "ticket.setDueDate"
  | "ticket.internalNote"
  | "ticket.viewInternal"
  | "ticket.publicReply"
  // email center
  | "email.account.manage"
  | "email.inbox.view"
  | "email.triage" // convert to ticket / mark info / ignore
  | "email.send"
  | "email.convertToTicket"
  // client portal
  | "portal.org.viewOwn"
  | "portal.users.manage";

const INTERNAL_MATRIX: Record<InternalRole, Permission[]> = {
  SUPER_ADMIN: ["__ALL__" as unknown as Permission],
  ADMIN: [
    "internal.users.manage",
    "internal.settings.manage",
    "internal.audit.view",
    "org.create",
    "org.update",
    "org.disable",
    "org.delete",
    "org.impersonate",
    "org.viewAll",
    "contact.manage",
    "asset.manage",
    "team.manage",
    "ticketConfig.manage",
    "emailTemplate.manage",
    "user.resetPassword",
    "reports.view",
    "ticket.viewAll",
    "ticket.create",
    "ticket.assign",
    "ticket.changeStatus",
    "ticket.changePriority",
    "ticket.setDueDate",
    "ticket.internalNote",
    "ticket.viewInternal",
    "ticket.publicReply",
    "email.account.manage",
    "email.inbox.view",
    "email.triage",
    "email.send",
    "email.convertToTicket",
  ],
  SUPPORT_MANAGER: [
    "org.viewAll",
    "org.impersonate",
    "contact.manage",
    "asset.manage",
    "team.manage",
    "ticketConfig.manage",
    "user.resetPassword",
    "reports.view",
    "ticket.viewAll",
    "ticket.create",
    "ticket.assign",
    "ticket.changeStatus",
    "ticket.changePriority",
    "ticket.setDueDate",
    "ticket.internalNote",
    "ticket.viewInternal",
    "ticket.publicReply",
    "email.inbox.view",
    "email.triage",
    "email.send",
    "email.convertToTicket",
  ],
  SUPPORT_AGENT: [
    "org.viewAll",
    "reports.view",
    "ticket.viewAll",
    "ticket.create",
    "ticket.changeStatus",
    "ticket.changePriority",
    "ticket.setDueDate",
    "ticket.internalNote",
    "ticket.viewInternal",
    "ticket.publicReply",
    "email.inbox.view",
    "email.triage",
    "email.send",
    "email.convertToTicket",
  ],
};

const CLIENT_MATRIX: Record<ClientRole, Permission[]> = {
  CLIENT_ADMIN: [
    "ticket.create",
    "ticket.publicReply",
    "portal.org.viewOwn",
    "portal.users.manage",
  ],
  CLIENT_USER: ["ticket.create", "ticket.publicReply", "portal.org.viewOwn"],
};

export function can(ctx: AuthContext, permission: Permission): boolean {
  if (ctx.isInternal && ctx.internalRole) {
    if (ctx.internalRole === "SUPER_ADMIN") return true;
    return INTERNAL_MATRIX[ctx.internalRole].includes(permission);
  }
  if (ctx.organization) {
    return CLIENT_MATRIX[ctx.organization.role].includes(permission);
  }
  return false;
}

export const INTERNAL_ROLE_RANK: Record<InternalRole, number> = {
  SUPPORT_AGENT: 1,
  SUPPORT_MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export function hasInternalRank(
  ctx: AuthContext,
  min: InternalRole,
): boolean {
  return (
    ctx.isInternal &&
    !!ctx.internalRole &&
    INTERNAL_ROLE_RANK[ctx.internalRole] >= INTERNAL_ROLE_RANK[min]
  );
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPPORT_MANAGER: "Support Manager",
  SUPPORT_AGENT: "Support Agent",
  CLIENT_ADMIN: "Client Admin",
  CLIENT_USER: "Client User",
};
