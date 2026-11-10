import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ConflictError } from '../errors';
import type { ReservationRecord, ReservationWithSpace } from './types';

export interface CreateReservationData {
  spaceId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  purpose: string;
}

export interface ReservationRepository {
  create(data: CreateReservationData): Promise<ReservationWithSpace>;
  findById(id: string): Promise<ReservationWithSpace | null>;
  /** Reservas CONFIRMED del espacio que se traslapan con [startAt, endAt). */
  findOverlapping(spaceId: string, startAt: Date, endAt: Date): Promise<ReservationRecord[]>;
  listByUser(userId: string): Promise<ReservationWithSpace[]>;
  /** Reservas CONFIRMED de un espacio que tocan el intervalo [from, to). */
  listConfirmedForSpaceBetween(spaceId: string, from: Date, to: Date): Promise<ReservationRecord[]>;
  /** Reservas CONFIRMED en curso en el instante dado (startAt <= at < endAt). */
  listActiveAt(at: Date): Promise<ReservationRecord[]>;
  cancel(id: string): Promise<ReservationWithSpace>;
}

const withSpace = { space: { select: { name: true, building: true } } } as const;

/** Código SQLSTATE de PostgreSQL para violación de una restricción EXCLUDE. */
export const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * Detecta la violación de la restricción reservations_no_overlap. Prisma la
 * entrega como error desconocido (no la modela), así que se revisan el código
 * SQLSTATE y el nombre de la restricción.
 */
export function isOverlapViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(err.meta ?? {});
    if (meta.includes(PG_EXCLUSION_VIOLATION) || meta.includes('reservations_no_overlap')) return true;
  }
  if (err instanceof Error) {
    return err.message.includes(PG_EXCLUSION_VIOLATION) || err.message.includes('reservations_no_overlap');
  }
  return false;
}

export function createReservationRepository(prisma: PrismaClient): ReservationRepository {
  const overlapping = (spaceId: string, from: Date, to: Date) =>
    prisma.reservation.findMany({
      where: { spaceId, status: 'CONFIRMED', startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: 'asc' },
    });

  return {
    async create(data) {
      try {
        return await prisma.reservation.create({ data, include: withSpace });
      } catch (err) {
        // Dos solicitudes simultáneas pueden pasar la validación del servicio;
        // la restricción EXCLUDE de PostgreSQL rechaza la segunda y aquí se traduce a 409.
        if (isOverlapViolation(err)) {
          throw new ConflictError('El espacio ya está reservado en ese horario', 'RESERVATION_OVERLAP');
        }
        throw err;
      }
    },

    findById: (id) => prisma.reservation.findUnique({ where: { id }, include: withSpace }),

    findOverlapping: overlapping,

    listByUser: (userId) =>
      prisma.reservation.findMany({ where: { userId }, include: withSpace, orderBy: { startAt: 'desc' } }),

    listConfirmedForSpaceBetween: overlapping,

    listActiveAt: (at) =>
      prisma.reservation.findMany({
        where: { status: 'CONFIRMED', startAt: { lte: at }, endAt: { gt: at } },
      }),

    cancel: (id) =>
      prisma.reservation.update({ where: { id }, data: { status: 'CANCELLED' }, include: withSpace }),
  };
}
