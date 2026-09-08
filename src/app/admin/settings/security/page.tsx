
import { prisma } from "@/server/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states";
import { formatDateTime } from "@/lib/format";
import { requireInternal } from "@/server/auth/context";

export default async function SecuritySettingsPage() {
  const ctx = await requireInternal("SUPPORT_MANAGER");
  const canAudit = ctx.internalRole === "ADMIN" || ctx.internalRole === "SUPER_ADMIN";

  const logs = canAudit
    ? await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      })
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Security posture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Passwords are hashed with bcrypt (cost 12). Admins never set or see passwords.</p>
          <p>• Sessions are signed JWTs in httpOnly, Secure, SameSite cookies (8h).</p>
          <p>• OAuth tokens for email accounts are encrypted at rest with AES-256-GCM.</p>
          <p>• Login, password-reset and invitation endpoints are rate limited.</p>
          <p>• Every sensitive action is written to the audit log.</p>
          <p>• Organization isolation is enforced server-side on every request.</p>
        </CardContent>
      </Card>

      {canAudit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Audit log (latest 50)</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <EmptyState title="No audit entries yet" />
            ) : (
              <ul className="divide-y text-sm">
                {logs.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div>
                      <span className="font-medium">
                        {l.actor?.name ?? "System"}
                      </span>{" "}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {l.action}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {l.entityType}
                        {l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(l.createdAt, ctx.timezone)}
                      {l.ipAddress ? ` · ${l.ipAddress}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
