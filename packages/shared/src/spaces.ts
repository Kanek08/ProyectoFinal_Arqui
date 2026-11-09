import { z } from 'zod';

/** Hora del día en formato HH:MM (24 h). */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato de hora inválido, se espera HH:MM');

const spaceBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  building: z.string().trim().min(1).max(100),
  capacity: z.coerce.number().int().positive().max(1000),
  openTime: timeOfDaySchema,
  closeTime: timeOfDaySchema,
});

export const createSpaceSchema = spaceBaseSchema.refine((s) => s.openTime < s.closeTime, {
  message: 'openTime debe ser menor que closeTime',
  path: ['closeTime'],
});
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

export const updateSpaceSchema = spaceBaseSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((s) => Object.keys(s).length > 0, { message: 'Debe enviar al menos un campo' });
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

export const spaceQuerySchema = z.object({
  building: z.string().trim().min(1).optional(),
  minCapacity: z.coerce.number().int().positive().optional(),
});
export type SpaceQuery = z.infer<typeof spaceQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido') });
export type IdParam = z.infer<typeof idParamSchema>;

export const spaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  building: z.string(),
  capacity: z.number().int(),
  openTime: timeOfDaySchema,
  closeTime: timeOfDaySchema,
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Space = z.infer<typeof spaceSchema>;
