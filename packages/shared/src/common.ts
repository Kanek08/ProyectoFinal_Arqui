import { z } from 'zod';

/** Formato único de error de la API: { error: { code, message, details? } } */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  services: z.object({
    api: z.enum(['up', 'down']),
    database: z.enum(['up', 'down']),
    cache: z.enum(['up', 'down']),
  }),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});
export type Health = z.infer<typeof healthSchema>;
