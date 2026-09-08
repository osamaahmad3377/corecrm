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
  /** Present only for client users — their single organization + role there. */
  organization: { id: string; role: ClientRole } | null;
  timezone: string;
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
  | "contact.manage"
  | "asset.manage"
  | "team.manage"
  | "ticketConfig.manage" // categories / priorities / statuses / SLA
  | "reports.view"
  // tickets
  | "ticket.viewAll"
  | "ticket.create"
  | "ticket.assign"
  | "ticket.changeStatus"
  | "ticket.changePriority"
  | "ticket.internalNote"
  | "ticket.viewInternal"
  | "ticket.publicReply"
  // email center
  | "email.account.manage"
  | "email.inbox.view"
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
    "org.viewAll",
    "contact.manage",
    "asset.manage",
    "team.manage",
    "ticketConfig.manage",
    "reports.view",
    "ticket.viewAll",
    "ticket.create",
    "ticket.assign",
    "ticket.changeStatus",
    "ticket.changePriority",
    "ticket.internalNote",
    "ticket.viewInternal",
    "ticket.publicReply",
    "email.account.manage",
    "email.inbox.view",
    "email.send",
    "email.convertToTicket",
  ],
  SUPPORT_MANAGER: [
    "org.viewAll",
    "contact.manage",
    "asset.manage",
    "team.manage",
    "ticketConfig.manage",
    "reports.view",
    "ticket.viewAll",
    "ticket.create",
    "ticket.assign",
    "ticket.changeStatus",
    "ticket.changePriority",
    "ticket.internalNote",
    "ticket.viewInternal",
    "ticket.publicReply",
    "email.inbox.view",
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
    "ticket.internalNote",
    "ticket.viewInternal",
    "ticket.publicReply",
    "email.inbox.view",
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
