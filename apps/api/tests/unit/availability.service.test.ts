import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservationRepository } from '../../src/repositories/reservation.repository';
import type { SpaceRepository } from '../../src/repositories/space.repository';
import type { ReservationRecord, SpaceRecord } from '../../src/repositories/types';
import { AvailabilityService } from '../../src/services/availability.service';

const base = { capacity: 20, active: true, createdAt: new Date(), updatedAt: new Date() };
const lab: SpaceRecord = {
  ...base,
  id: 's1',
  name: 'Lab 1',
  building: 'A',
  openTime: '07:00',
  closeTime: '10:30',
};
const salon: SpaceRecord = {
  ...base,
  id: 's2',
  name: 'Salón',
  building: 'B',
  openTime: '07:00',
  closeTime: '21:00',
};

const booking = (spaceId: string, start: string, end: string): ReservationRecord => ({
  id: `r-${spaceId}-${start}`,
  spaceId,
  userId: 'u1',
  startAt: new Date(start),
  endAt: new Date(end),
  purpose: 'Clase',
  status: 'CONFIRMED',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('AvailabilityService (repositorios simulados)', () => {
  let spaces: { findById: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
  let reservations: {
    listConfirmedForSpaceBetween: ReturnType<typeof vi.fn>;
    listActiveAt: ReturnType<typeof vi.fn>;
  };
  let service: AvailabilityService;

  beforeEach(() => {
    spaces = { findById: vi.fn().mockResolvedValue(lab), list: vi.fn().mockResolvedValue([lab, salon]) };
    reservations = { listConfirmedForSpaceBetween: vi.fn().mockResolvedValue([]), listActiveAt: vi.fn() };
    service = new AvailabilityService({
      spaces: spaces as unknown as SpaceRepository,
      reservations: reservations as unknown as ReservationRepository,
      now: () => new Date('2026-11-10T15:30:00Z'),
    });
  });

  it('parte el horario en bloques de 1 hora en hora de Guatemala (el último puede ser menor)', async () => {
    // Reserva de 08:30 a 09:15 hora local: ocupa los bloques 08-09 y 09-10.
    reservations.listConfirmedForSpaceBetween.mockResolvedValue([
      booking('s1', '2026-11-10T14:30:00Z', '2026-11-10T15:15:00Z'),
    ]);
    const result = await service.forSpace('s1', '2026-11-10');

    expect(reservations.listConfirmedForSpaceBetween).toHaveBeenCalledWith(
      's1',
      new Date('2026-11-10T13:00:00Z'),
      new Date('2026-11-10T16:30:00Z'),
    );
    expect(result.timezone).toBe('America/Guatemala');
    expect(result.blocks.map((b) => `${b.startTime}-${b.endTime}:${b.status}`)).toEqual([
      '07:00-08:00:FREE',
      '08:00-09:00:BUSY',
      '09:00-10:00:BUSY',
      '10:00-10:30:FREE',
    ]);
  });

  it('valida que la fecha exista y que el espacio esté activo', async () => {
    await expect(service.forSpace('s1', '2026-02-30')).rejects.toMatchObject({ status: 422 });
    spaces.findById.mockResolvedValue({ ...lab, active: false });
    await expect(service.forSpace('s1', '2026-11-10')).rejects.toMatchObject({ status: 404 });
  });

  it('agrupa la ocupación actual por edificio', async () => {
    reservations.listActiveAt.mockResolvedValue([
      booking('s2', '2026-11-10T15:00:00Z', '2026-11-10T17:00:00Z'),
    ]);
    const result = await service.currentOccupancy();

    expect(reservations.listActiveAt).toHaveBeenCalledWith(new Date('2026-11-10T15:30:00Z'));
    expect(result.buildings).toEqual([
      {
        building: 'A',
        total: 1,
        occupied: 0,
        spaces: [expect.objectContaining({ status: 'FREE', current: null })],
      },
      {
        building: 'B',
        total: 1,
        occupied: 1,
        spaces: [
          expect.objectContaining({
            status: 'BUSY',
            current: { purpose: 'Clase', startTime: '09:00', endTime: '11:00' },
          }),
        ],
      },
    ]);
  });
});
