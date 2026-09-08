import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { ClientRole, InternalRole } from "@prisma/client";
import { SESSION_MAX_AGE } from "@/lib/constants";

// Ensure the module is referenced so the `declare module` augmentation below
// resolves under bundler module resolution.
export type { JWT };

/**
 * Edge-safe Auth.js configuration. Contains no database or Node-only code so it
 * can run in `middleware.ts`. The Credentials provider (which needs Prisma +
 * bcrypt) is added in `./index.ts` for the Node runtime.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isInternal: boolean;
      internalRole: InternalRole | null;
      organizationId: string | null;
      organizationRole: ClientRole | null;
      timezone: string;
    };
  }
  interface User {
    isInternal?: boolean;
    internalRole?: InternalRole | null;
    organizationId?: string | null;
    organizationRole?: ClientRole | null;
    timezone?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    isInternal: boolean;
    internalRole: InternalRole | null;
    organizationId: string | null;
    organizationRole: ClientRole | null;
    timezone: string;
  }
}

export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id as string;
        token.isInternal = Boolean(user.isInternal);
        token.internalRole = (user.internalRole ?? null) as JWT["internalRole"];
        token.organizationId = user.organizationId ?? null;
        token.organizationRole =
          (user.organizationRole ?? null) as JWT["organizationRole"];
        token.timezone = user.timezone ?? "UTC";
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
      }
      if (trigger === "update" && session && typeof session === "object") {
        const tz = (session as { timezone?: string }).timezone;
        const name = (session as { name?: string }).name;
        if (tz) token.timezone = tz;
        if (name) token.name = name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid;
      session.user.email = (token.email as string) ?? session.user.email;
      session.user.name = (token.name as string) ?? session.user.name;
      session.user.isInternal = token.isInternal;
      session.user.internalRole = token.internalRole;
      session.user.organizationId = token.organizationId;
      session.user.organizationRole = token.organizationRole;
      session.user.timezone = token.timezone;
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
