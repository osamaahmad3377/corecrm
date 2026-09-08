import { z } from "zod";
import { emailSchema } from "./common";

export const inviteInternalUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: emailSchema,
  internalRole: z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "SUPPORT_MANAGER",
    "SUPPORT_AGENT",
  ]),
});

export const inviteClientUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: emailSchema,
  organizationId: z.string().uuid(),
  clientRole: z.enum(["CLIENT_ADMIN", "CLIENT_USER"]).default("CLIENT_USER"),
});

export const changeUserRoleSchema = z.object({
  userId: z.string().uuid(),
  internalRole: z
    .enum(["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"])
    .optional(),
  clientRole: z.enum(["CLIENT_ADMIN", "CLIENT_USER"]).optional(),
});

export const setUserStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});
