import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./config";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "./password";
import { logger } from "@/lib/logger";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            organizationLinks: {
              include: { organization: { select: { status: true } } },
            },
          },
        });

        if (!user || user.status === "DISABLED") return null;
        if (!user.hashedPassword) return null; // invitation not completed

        const ok = await verifyPassword(password, user.hashedPassword);
        if (!ok) return null;

        const link = user.organizationLinks[0];
        // Client users whose organization is disabled cannot sign in.
        if (
          !user.isInternal &&
          link &&
          link.organization.status === "DISABLED"
        ) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        logger.info("auth.login", { userId: user.id });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isInternal: user.isInternal,
          internalRole: user.internalRole,
          organizationId: link?.organizationId ?? null,
          organizationRole: link?.role ?? null,
          timezone: user.timezone,
        };
      },
    }),
  ],
});
