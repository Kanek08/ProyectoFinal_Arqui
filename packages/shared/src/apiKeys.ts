import { z } from 'zod';
import { apiKeyPermissionSchema } from './roles';

export const API_KEY_HEADER = 'X-API-Key';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(100),
  permissions: z
    .array(apiKeyPermissionSchema)
    .min(1, 'Debe asignar al menos un permiso')
    .transform((p) => [...new Set(p)]),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/** API key tal como se lista: nunca incluye el hash ni la key completa. */
export const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  permissions: z.array(apiKeyPermissionSchema),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Respuesta de POST /api-keys: la key completa se muestra solo esta vez. */
export const createdApiKeySchema = apiKeySchema.extend({ key: z.string() });
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
