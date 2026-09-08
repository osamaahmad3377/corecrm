import { z } from "zod";

/**
 * Centralised, validated environment access. Import `env` from here rather than
 * reading `process.env` directly so misconfiguration fails fast and loudly.
 *
 * Only server code should import this module.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  AUTH_SECRET: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),

  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required (base64-encoded 32 bytes)"),

  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),

  MICROSOFT_CLIENT_ID: z.string().optional().default(""),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(""),
  MICROSOFT_TENANT_ID: z.string().optional().default("common"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_PUBSUB_TOPIC: z.string().optional().default(""),
  GOOGLE_PUBSUB_VERIFICATION_AUDIENCE: z.string().optional().default(""),

  EMAIL_WEBHOOK_SECRET: z.string().min(1).default("dev-webhook-secret"),
  CRON_SECRET: z.string().min(1).default("dev-cron-secret"),

  UPSTASH_REDIS_REST_URL: z.string().optional().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(""),

  EMAIL_FROM: z
    .string()
    .optional()
    .default("CoreCRM Support <support@example.com>"),
  RESEND_API_KEY: z.string().optional().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

export const features = {
  microsoftEmail: Boolean(
    env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET,
  ),
  googleEmail: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  blobStorage: Boolean(env.BLOB_READ_WRITE_TOKEN),
  distributedRateLimit: Boolean(
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN,
  ),
  transactionalEmail: Boolean(env.RESEND_API_KEY),
};
