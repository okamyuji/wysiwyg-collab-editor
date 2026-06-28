import { z, type RefinementCtx } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
const NODE_ENVS = ["development", "production", "test"] as const;
const DB_SSL_MODES = ["require", "disable", "prefer"] as const;

const booleanString = z.preprocess((value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const secret = (name: string) =>
  z.string().superRefine((value: string, ctx: RefinementCtx) => {
    if (Buffer.byteLength(value, "utf8") < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} must be at least 32 bytes`,
      });
    }
  });

export class EnvConfigError extends Error {
  constructor(
    public readonly code: "ENV-001" | "ENV-002" | "ENV-003",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EnvConfigError";
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS),
  LOG_LEVEL: z.enum(LOG_LEVELS),
  APP_BASE_URL: z.string().url(),
  SESSION_COOKIE_DOMAIN: z.string().min(1),
  SESSION_SECRET: secret("SESSION_SECRET"),
  CSRF_SECRET: secret("CSRF_SECRET"),
  CACHE_ETAG_SECRET: secret("CACHE_ETAG_SECRET"),
  IP_HASH_SECRET: secret("IP_HASH_SECRET"),
  GUEST_WS_TOKEN_SECRET: secret("GUEST_WS_TOKEN_SECRET"),
  AUDIT_CURRENT_SALT_VERSION: z.coerce.number().int().min(1),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1),
  DB_SSL_MODE: z.enum(DB_SSL_MODES),
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string(),
  REDIS_TLS: booleanString,
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET_IMAGES: z.string().min(1),
  S3_BUCKET_EXPORTS: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: z.string(),
  SMTP_PASSWORD: z.string(),
  MAIL_FROM: z.string().email(),
  HIBP_API_TIMEOUT_MS: z.coerce.number().int().min(1),
  EXPORT_WORKER_REPLICAS: z.coerce.number().int().min(1),
  EXPORT_WORKER_CONCURRENCY: z.coerce.number().int().min(1),
  PREVIEW_URL: z.string().url().optional(),
  IMAGE_TAG: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LOKI_PUSH_URL: z.string().url(),
  LOKI_BEARER_TOKEN: z.string(),
  PROXY_REJECT_BEARER_TOKEN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const flattened = result.error.flatten();
  const fieldErrors = Object.values(flattened.fieldErrors) as Array<string[] | undefined>;
  const hasSecretLengthError = fieldErrors
    .flat()
    .some((message) => message?.includes("must be at least 32 bytes"));

  throw new EnvConfigError(
    hasSecretLengthError ? "ENV-003" : "ENV-001",
    hasSecretLengthError ? "Secret key too short" : "Required env missing or invalid",
    flattened,
  );
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  try {
    return parseEnv(source);
  } catch (error) {
    if (error instanceof EnvConfigError) {
      console.error(`${error.code}: ${error.message}`, error.details ?? {});
      process.exit(1);
    }
    throw error;
  }
}
