import type { Availability, AvailabilityBlock, NowOccupancy, NowSpace } from '@reservalab/shared';
import { TIMEZONE } from '@reservalab/shared';
import { NotFoundError, ValidationError } from '../errors';
import { isRealDate, localTime, localToUtc } from '../lib/time';
import type { ReservationRepository } from '../repositories/reservation.repository';
import type { SpaceRepository } from '../repositories/space.repository';
import type { ReservationRecord } from '../repositories/types';

const HOUR_MS = 60 * 60 * 1000;

const overlaps = (r: ReservationRecord, start: Date, end: Date) => r.startAt < end && r.endAt > start;

/**
 * Consultas de ocupación (lectura):
 * - RF-07: bloques de 1 hora libres u ocupados de un espacio en una fecha local.
 * - RF-11: qué espacios están ocupados ahora, agrupados por edificio.
 */
export class AvailabilityService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      spaces: SpaceRepository;
      reservations: ReservationRepository;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async forSpace(spaceId: string, date: string): Promise<Availability> {
    if (!isRealDate(date)) {
      throw new ValidationError('La fecha no existe en el calendario', [
        { location: 'query', path: ['date'], message: 'Fecha inválida' },
      ]);
    }
    const space = await this.deps.spaces.findById(spaceId);
    if (!space || !space.active) throw new NotFoundError('El espacio no existe', 'SPACE_NOT_FOUND');

    const open = localToUtc(date, space.openTime);
    const close = localToUtc(date, space.closeTime);
    const reservations = await this.deps.reservations.listConfirmedForSpaceBetween(space.id, open, close);

    const blocks: AvailabilityBlock[] = [];
    for (let start = open; start < close;) {
      const end = new Date(Math.min(start.getTime() + HOUR_MS, close.getTime()));
      blocks.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        startTime: localTime(start),
        endTime: localTime(end),
        status: reservations.some((r) => overlaps(r, start, end)) ? 'BUSY' : 'FREE',
      });
      start = end;
    }

    return {
      spaceId: space.id,
      spaceName: space.name,
      building: space.building,
      date,
      timezone: TIMEZONE,
      openTime: space.openTime,
      closeTime: space.closeTime,
      blocks,
    };
  }

  async currentOccupancy(): Promise<NowOccupancy> {
    return this.occupancyAt(this.now());
  }

  async occupancyAt(at: Date): Promise<NowOccupancy> {
    const [spaces, active] = await Promise.all([
      this.deps.spaces.list({}),
      this.deps.reservations.listActiveAt(at),
    ]);
    const bySpace = new Map(active.map((r) => [r.spaceId, r]));

    const buildings = new Map<string, NowSpace[]>();
    for (const space of spaces) {
      const current = bySpace.get(space.id);
      const entry: NowSpace = {
        spaceId: space.id,
        name: space.name,
        capacity: space.capacity,
        status: current ? 'BUSY' : 'FREE',
        current: current
          ? {
              purpose: current.purpose,
              startTime: localTime(current.startAt),
              endTime: localTime(current.endAt),
            }
          : null,
      };
      buildings.set(space.building, [...(buildings.get(space.building) ?? []), entry]);
    }

    return {
      at: at.toISOString(),
      timezone: TIMEZONE,
      buildings: [...buildings.entries()].map(([building, list]) => ({
        building,
        total: list.length,
        occupied: list.filter((s) => s.status === 'BUSY').length,
        spaces: list,
      })),
    };
  }
}
