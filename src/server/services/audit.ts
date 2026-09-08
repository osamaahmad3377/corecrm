import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { logger } from "@/lib/logger";

export type AuditAction =
  | "USER_INVITED"
  | "USER_INVITATION_RESENT"
  | "USER_INVITATION_REVOKED"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_STATUS_CHANGED"
  | "USER_PASSWORD_CHANGED"
  | "ORGANIZATION_CREATED"
  | "ORGANIZATION_UPDATED"
  | "ORGANIZATION_DISABLED"
  | "ORGANIZATION_ENABLED"
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "CONTACT_DELETED"
  | "ASSET_CREATED"
  | "ASSET_UPDATED"
  | "ASSET_DELETED"
  | "TICKET_CREATED"
  | "TICKET_UPDATED"
  | "TICKET_ASSIGNED"
  | "TICKET_STATUS_CHANGED"
  | "TICKET_PRIORITY_CHANGED"
  | "TICKET_MESSAGE_ADDED"
  | "TICKET_NOTE_ADDED"
  | "TICKET_REOPENED"
  | "EMAIL_ACCOUNT_CONNECTED"
  | "EMAIL_ACCOUNT_DISCONNECTED"
  | "EMAIL_ACCOUNT_UPDATED"
  | "EMAIL_SENT"
  | "EMAIL_RECEIVED"
  | "EMAIL_CONVERTED_TO_TICKET"
  | "SETTINGS_UPDATED"
  | "SLA_POLICY_UPDATED"
  | "CATEGORY_UPDATED";

interface AuditParams {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail. Never throws into the caller — an audit failure must
 * not roll back the business action, but it is logged loudly.
 */
export async function recordAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        actorUserId: params.actorUserId ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata,
      },
    });
  } catch (e) {
    logger.error("audit.write_failed", { action: params.action, error: e });
  }
}

/** Same, but inside an existing transaction (best-effort). */
export async function recordAuditTx(
  tx: Prisma.TransactionClient,
  params: AuditParams,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      actorUserId: params.actorUserId ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: params.metadata,
    },
  });
}
