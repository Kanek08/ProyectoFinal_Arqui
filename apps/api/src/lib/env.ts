import { z } from 'zod';

/**
 * Variables de entorno validadas al arrancar. Si falta alguna o es inválida,
 * la API no inicia y muestra qué variable corregir (fail fast).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  NOTIFICATIONS_URL: z.string().url(),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  API_KEY_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(
      `Variables de entorno inválidas:\n${problems}\nRevisa tu archivo .env (ver .env.example).`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
