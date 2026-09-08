import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/server/db/client";
import { sha256, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { IMPERSONATION_COOKIE } from "./impersonation-constants";

/**
 * "View as client" impersonation. An internal user with `org.impersonate` can
 * open a client organization's portal. The state is a signed cookie:
 * `<orgId>.<hmac(orgId + userId)>`. Only the portal auth path consumes it.
 */

export { IMPERSONATION_COOKIE };

function sign(orgId: string, userId: string): string {
  return sha256(`${orgId}:${userId}:${env.AUTH_SECRET}`);
}

export async function setImpersonation(orgId: string, userId: string) {
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, `${orgId}.${sign(orgId, userId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
}

export async function clearImpersonation() {
  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE);
}

/** Returns the impersonated orgId if the cookie is present and valid for this user. */
export async function readImpersonation(
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  const [orgId, mac] = raw.split(".");
  if (!orgId || !mac || !safeEqual(mac, sign(orgId, userId))) return null;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, status: true },
  });
  if (!org) return null;
  return { id: org.id, name: org.name };
}
