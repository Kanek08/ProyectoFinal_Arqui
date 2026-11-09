import { z } from 'zod';

export const ROLES = ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const RESERVATION_STATUSES = ['CONFIRMED', 'CANCELLED'] as const;
export const reservationStatusSchema = z.enum(RESERVATION_STATUSES);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

/** Permisos que se pueden asignar a una API key. */
export const API_KEY_PERMISSIONS = ['read:spaces', 'read:now', 'read:availability'] as const;
export const apiKeyPermissionSchema = z.enum(API_KEY_PERMISSIONS);
export type ApiKeyPermission = z.infer<typeof apiKeyPermissionSchema>;
