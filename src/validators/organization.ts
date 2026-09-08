import { z } from "zod";
import { emailSchema, optionalUrl, phoneSchema } from "./common";

export const organizationInputSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required").max(160),
  legalName: z.string().trim().max(160).optional().or(z.literal("")),
  website: optionalUrl,
  sharepointUrl: optionalUrl,
  industry: z.string().trim().max(80).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(160).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  postalCode: z.string().trim().max(24).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  businessHours: z.string().trim().max(160).optional().or(z.literal("")),
  mainPhone: phoneSchema,
  mainEmail: emailSchema.optional().or(z.literal("")),
  accountManagerId: z.string().uuid().optional().or(z.literal("")),
  onboardingDate: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type OrganizationInput = z.infer<typeof organizationInputSchema>;

export const primaryContactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: emailSchema,
  phone: phoneSchema,
  position: z.string().trim().max(120).optional().or(z.literal("")),
});

export const onboardOrganizationSchema = z.object({
  organization: organizationInputSchema,
  primaryContact: primaryContactSchema,
  inviteClientAdmin: z.boolean().default(true),
});

export const deleteOrganizationSchema = z.object({
  confirmName: z.string().trim().min(1),
});

export type OnboardOrganizationInput = z.infer<typeof onboardOrganizationSchema>;
