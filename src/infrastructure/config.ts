import * as v from 'valibot';

const EnvSchema = v.object({
  NODE_ENV: v.fallback(v.picklist(['development', 'production', 'test']), 'development'),
  PORT: v.fallback(
    v.pipe(
      v.string(),
      v.transform((val) => parseInt(val, 10)),
      v.minValue(1),
      v.maxValue(65535)
    ),
    3000
  ),
  APP_URL: v.fallback(v.pipe(v.string(), v.url()), 'http://localhost:3000'),
  DATABASE_URL: v.pipe(
    v.string('DATABASE_URL is required'),
    v.minLength(1, 'DATABASE_URL cannot be empty')
  ),
  ADMIN_SETUP_SECRET: v.pipe(
    v.string('ADMIN_SETUP_SECRET is required'),
    v.minLength(16, 'ADMIN_SETUP_SECRET must be at least 16 characters long')
  ),
  BETTER_AUTH_SECRET: v.optional(v.string()),
  BETTER_AUTH_URL: v.optional(v.string()),
});

export type EnvConfig = v.InferOutput<typeof EnvSchema>;

let parsedConfig: EnvConfig | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  if (parsedConfig && env === process.env) {
    return parsedConfig;
  }

  const result = v.safeParse(EnvSchema, env);

  if (!result.success) {
    const errorMessages = result.issues.map((issue) => ` - ${issue.path?.map((p) => p.key).join('.')}: ${issue.message}`).join('\n');
    throw new Error(`[SupaStore Configuration Error] Invalid environment configuration:\n${errorMessages}`);
  }

  if (env === process.env) {
    parsedConfig = result.output;
  }

  return result.output;
}
