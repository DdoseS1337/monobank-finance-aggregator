import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional: enables local JWT verification (faster). Without it the guard
  // falls back to a network call against the Supabase Auth API on every request.
  SUPABASE_JWT_SECRET: z.string().optional().default(''),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL_DEFAULT: z.string().default('gpt-4o'),
  OPENAI_MODEL_CHEAP: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  MONOBANK_BASE_URL: z.string().url().default('https://api.monobank.ua'),
  MONOBANK_TOKEN: z.string().optional().default(''),
  MONOBANK_WEBHOOK_SECRET: z.string().optional().default(''),

  // 32-byte AES-256 key (base64) used by CredentialVault to encrypt
  // provider API tokens at rest. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .min(1, 'CREDENTIAL_ENCRYPTION_KEY is required')
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).',
    }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(false),

  ENABLE_AI_GUARDRAILS: z.coerce.boolean().default(true),
  ENABLE_TWO_STEP_CONFIRMATION: z.coerce.boolean().default(true),
  ENABLE_RECOMMENDATION_PIPELINE: z.coerce.boolean().default(true),
  ENABLE_SCENARIO_SIMULATION: z.coerce.boolean().default(true),
});

export type AppEnv = z.infer<typeof schema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
