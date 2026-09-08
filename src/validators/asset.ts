import { z } from "zod";

export const assetInputSchema = z.object({
  name: z.string().trim().min(1, "Asset name is required").max(160),
  assetType: z.enum([
    "LAPTOP",
    "DESKTOP",
    "SERVER",
    "PRINTER",
    "ROUTER",
    "FIREWALL",
    "MOBILE",
    "M365_TENANT",
    "WEBSITE",
    "DOMAIN",
    "SOFTWARE",
    "OTHER",
  ]),
  serialNumber: z.string().trim().max(120).optional().or(z.literal("")),
  model: z.string().trim().max(120).optional().or(z.literal("")),
  manufacturer: z.string().trim().max(120).optional().or(z.literal("")),
  ipAddress: z.string().trim().max(64).optional().or(z.literal("")),
  hostname: z.string().trim().max(120).optional().or(z.literal("")),
  purchaseDate: z.string().optional().or(z.literal("")),
  warrantyExpiry: z.string().optional().or(z.literal("")),
  assignedUserId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type AssetInput = z.infer<typeof assetInputSchema>;
