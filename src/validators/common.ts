import { z } from "zod";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/lib/constants";

export const idSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n), {
      message: "Invalid page size",
    })
    .default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+()\-\s\d.]*$/, "Enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const optionalUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .optional()
  .or(z.literal(""));
