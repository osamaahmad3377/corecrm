import { z } from "zod";
import { emailSchema, phoneSchema } from "./common";

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: emailSchema,
  phone: phoneSchema,
  position: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
});

export type ContactInput = z.infer<typeof contactInputSchema>;
