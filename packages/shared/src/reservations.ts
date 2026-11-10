import { z } from 'zod';
import { reservationStatusSchema } from './roles';

/** Zona horaria de la facultad. Guatemala usa UTC-6 todo el año (sin horario de verano). */
export const TIMEZONE = 'America/Guatemala';

/** Duración máxima de una reserva, en horas. */
export const MAX_RESERVATION_HOURS = 4;

/** Fecha y hora ISO 8601 con zona horaria explícita, p. ej. 2026-11-10T08:00:00-06:00. */
export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Fecha y hora inválida, se espera ISO 8601 con zona horaria' });

/** Fecha de calendario YYYY-MM-DD. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Fecha inválida, se espera YYYY-MM-DD');

/**
 * Cuerpo de POST /reservations. Aquí solo se valida el formato; las reglas de
 * negocio (fin > inicio, máximo 4 horas, dentro del horario) viven en el servicio.
 */
export const createReservationSchema = z.object({
  spaceId: z.string().uuid('Identificador de espacio inválido'),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  purpose: z.string().trim().min(3, 'Describe el motivo de la reserva').max(200),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const reservationSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  userId: z.string().uuid(),
  startAt: z.string(),
  endAt: z.string(),
  purpose: z.string(),
  status: reservationStatusSchema,
  createdAt: z.string(),
  space: z.object({ name: z.string(), building: z.string() }).optional(),
});
export type Reservation = z.infer<typeof reservationSchema>;

export const availabilityQuerySchema = z.object({ date: dateOnlySchema });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const BLOCK_STATUSES = ['FREE', 'BUSY'] as const;
export const blockStatusSchema = z.enum(BLOCK_STATUSES);
export type BlockStatus = z.infer<typeof blockStatusSchema>;

export const availabilityBlockSchema = z.object({
  startAt: z.string().describe('Inicio del bloque (ISO, UTC)'),
  endAt: z.string().describe('Fin del bloque (ISO, UTC)'),
  startTime: z.string().describe('Hora local HH:MM'),
  endTime: z.string().describe('Hora local HH:MM'),
  status: blockStatusSchema,
});
export type AvailabilityBlock = z.infer<typeof availabilityBlockSchema>;

export const availabilitySchema = z.object({
  spaceId: z.string().uuid(),
  spaceName: z.string(),
  building: z.string(),
  date: dateOnlySchema,
  timezone: z.string(),
  openTime: z.string(),
  closeTime: z.string(),
  blocks: z.array(availabilityBlockSchema),
});
export type Availability = z.infer<typeof availabilitySchema>;

export const nowSpaceSchema = z.object({
  spaceId: z.string().uuid(),
  name: z.string(),
  capacity: z.number().int(),
  status: blockStatusSchema,
  current: z.object({ purpose: z.string(), startTime: z.string(), endTime: z.string() }).nullable(),
});
export type NowSpace = z.infer<typeof nowSpaceSchema>;

export const nowSchema = z.object({
  at: z.string(),
  timezone: z.string(),
  buildings: z.array(
    z.object({
      building: z.string(),
      total: z.number().int(),
      occupied: z.number().int(),
      spaces: z.array(nowSpaceSchema),
    }),
  ),
});
export type NowOccupancy = z.infer<typeof nowSchema>;
