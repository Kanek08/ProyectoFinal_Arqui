import type { ReservationStatus, Role } from '@reservalab/shared';

/**
 * Registros de dominio que devuelven los repositorios. Los servicios dependen
 * de estas interfaces, no de Prisma, para poder probarse con mocks.
 */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface SpaceRecord {
  id: string;
  name: string;
  building: string;
  capacity: number;
  openTime: string;
  closeTime: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationRecord {
  id: string;
  spaceId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  purpose: string;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Reserva con los datos mínimos del espacio, para listados y notificaciones. */
export interface ReservationWithSpace extends ReservationRecord {
  space: { name: string; building: string };
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  keyHash: string;
  permissions: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}
