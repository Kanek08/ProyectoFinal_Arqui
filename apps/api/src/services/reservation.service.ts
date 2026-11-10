import type { CreateReservationInput, Reservation, Role } from '@reservalab/shared';
import { MAX_RESERVATION_HOURS } from '@reservalab/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import type { CacheInvalidator } from '../lib/cache';
import { localDate, localTime } from '../lib/time';
import type { ReservationRepository } from '../repositories/reservation.repository';
import type { SpaceRepository } from '../repositories/space.repository';
import type { ReservationRecord, ReservationWithSpace } from '../repositories/types';
import type { NotificationEvent, NotificationService } from './notification.service';

export function toReservationDto(r: ReservationRecord | ReservationWithSpace): Reservation {
  return {
    id: r.id,
    spaceId: r.spaceId,
    userId: r.userId,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    purpose: r.purpose,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    ...('space' in r ? { space: r.space } : {}),
  };
}

export interface ReservationServiceDeps {
  reservations: ReservationRepository;
  spaces: SpaceRepository;
  notifications: NotificationService;
  cache: CacheInvalidator;
  now?: () => Date;
}

/** Quién ejecuta la acción (viene del JWT). */
export interface Actor {
  id: string;
  role: Role;
}

const HOUR_MS = 60 * 60 * 1000;

function invalidTime(field: string, message: string, code = 'INVALID_RESERVATION_TIME') {
  return new ValidationError(message, [{ path: [field], message }], code);
}

/**
 * Reglas de negocio de reservas:
 * - El fin es posterior al inicio, dura como máximo 4 horas, no está en el pasado
 *   y cae dentro del horario del espacio (hora de Guatemala, mismo día).
 * - Un espacio no puede tener dos reservas CONFIRMED traslapadas (409). Se valida
 *   aquí y, para solicitudes simultáneas, también lo garantiza la base de datos.
 * - Solo el dueño o un administrador cancelan.
 * - Al confirmar o cancelar se invalida la caché del espacio y se avisa al servicio
 *   de notificaciones; si ese aviso falla la reserva no se revierte.
 */
export class ReservationService {
  private readonly now: () => Date;

  constructor(private readonly deps: ReservationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async create(actor: Actor, input: CreateReservationInput): Promise<Reservation> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);

    const space = await this.deps.spaces.findById(input.spaceId);
    if (!space || !space.active) throw new NotFoundError('El espacio no existe', 'SPACE_NOT_FOUND');

    this.validateTimes(startAt, endAt, space.openTime, space.closeTime);

    const overlapping = await this.deps.reservations.findOverlapping(space.id, startAt, endAt);
    if (overlapping.length > 0) {
      throw new ConflictError('El espacio ya está reservado en ese horario', 'RESERVATION_OVERLAP', {
        conflicts: overlapping.map((r) => ({
          id: r.id,
          startAt: r.startAt.toISOString(),
          endAt: r.endAt.toISOString(),
        })),
      });
    }

    // Si otra solicitud ganó la carrera, el repositorio convierte el error 23P01 en 409.
    const created = await this.deps.reservations.create({
      spaceId: space.id,
      userId: actor.id,
      startAt,
      endAt,
      purpose: input.purpose,
    });

    await this.afterChange(created, 'reservation.confirmed');
    return toReservationDto(created);
  }

  async listMine(userId: string): Promise<Reservation[]> {
    const rows = await this.deps.reservations.listByUser(userId);
    return rows.map(toReservationDto);
  }

  async cancel(actor: Actor, id: string): Promise<Reservation> {
    const reservation = await this.deps.reservations.findById(id);
    if (!reservation) throw new NotFoundError('La reserva no existe', 'RESERVATION_NOT_FOUND');

    if (reservation.userId !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenError(
        'Solo el dueño de la reserva o un administrador puede cancelarla',
        'NOT_RESERVATION_OWNER',
      );
    }
    if (reservation.status === 'CANCELLED') {
      throw new ConflictError('La reserva ya estaba cancelada', 'RESERVATION_ALREADY_CANCELLED');
    }

    const cancelled = await this.deps.reservations.cancel(id);
    await this.afterChange(cancelled, 'reservation.cancelled');
    return toReservationDto(cancelled);
  }

  private validateTimes(startAt: Date, endAt: Date, openTime: string, closeTime: string) {
    if (endAt <= startAt) throw invalidTime('endAt', 'La hora de fin debe ser posterior a la de inicio');
    if (endAt.getTime() - startAt.getTime() > MAX_RESERVATION_HOURS * HOUR_MS) {
      throw invalidTime('endAt', `Una reserva puede durar como máximo ${MAX_RESERVATION_HOURS} horas`);
    }
    if (startAt < this.now()) throw invalidTime('startAt', 'No se puede reservar en el pasado');

    // Se compara en hora local de Guatemala; las horas HH:MM se comparan como texto.
    const sameDay = localDate(startAt) === localDate(new Date(endAt.getTime() - 1));
    const start = localTime(startAt);
    const end = localTime(endAt) === '00:00' ? '24:00' : localTime(endAt);
    if (!sameDay || start < openTime || end > closeTime) {
      throw invalidTime(
        'startAt',
        `La reserva debe estar dentro del horario del espacio (${openTime} a ${closeTime})`,
        'OUTSIDE_SPACE_HOURS',
      );
    }
  }

  private async afterChange(r: ReservationWithSpace, event: NotificationEvent) {
    // La caché se invalida antes de responder: nunca se mostrará libre un espacio recién reservado.
    await this.deps.cache.spaceReservationsChanged(r.spaceId);
    try {
      await this.deps.notifications.notify({
        event,
        reservationId: r.id,
        spaceId: r.spaceId,
        spaceName: r.space.name,
        building: r.space.building,
        userId: r.userId,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        purpose: r.purpose,
        occurredAt: this.now().toISOString(),
      });
    } catch {
      // El contrato de NotificationService es no lanzar; esto es una segunda red de seguridad.
    }
  }
}
