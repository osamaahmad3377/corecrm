import { z } from "zod";

export const teamInputSchema = z.object({
  name: z.string().trim().min(2, "Team name is required").max(80),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export type TeamInput = z.infer<typeof teamInputSchema>;
