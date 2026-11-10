import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheInvalidator } from '../../src/lib/cache';
import type { ReservationRepository } from '../../src/repositories/reservation.repository';
import type { SpaceRepository } from '../../src/repositories/space.repository';
import type { ReservationWithSpace, SpaceRecord } from '../../src/repositories/types';
import type { NotificationService } from '../../src/services/notification.service';
import { ReservationService } from '../../src/services/reservation.service';

const NOW = new Date('2026-11-10T12:00:00Z'); // 06:00 en Guatemala
const docente = { id: '11111111-1111-4111-8111-111111111111', role: 'DOCENTE' as const };
const otroDocente = { id: '44444444-4444-4444-8444-444444444444', role: 'DOCENTE' as const };
const admin = { id: '55555555-5555-4555-8555-555555555555', role: 'ADMIN' as const };

const space: SpaceRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Lab 1',
  building: 'Edificio A',
  capacity: 30,
  openTime: '07:00',
  closeTime: '21:00',
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const input = (start: string, end: string) => ({
  spaceId: space.id,
  startAt: `2026-11-11T${start}:00-06:00`,
  endAt: `2026-11-11T${end}:00-06:00`,
  purpose: 'Clase',
});

function reservation(overrides: Partial<ReservationWithSpace> = {}): ReservationWithSpace {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    spaceId: space.id,
    userId: docente.id,
    startAt: new Date('2026-11-11T15:00:00Z'),
    endAt: new Date('2026-11-11T16:00:00Z'),
    purpose: 'Clase',
    status: 'CONFIRMED',
    createdAt: NOW,
    updatedAt: NOW,
    space: { name: space.name, building: space.building },
    ...overrides,
  };
}

describe('ReservationService (repositorios y notificaciones simulados)', () => {
  let reservations: { [K in keyof ReservationRepository]: ReturnType<typeof vi.fn> };
  let spaces: { [K in keyof SpaceRepository]: ReturnType<typeof vi.fn> };
  let notifications: { notify: ReturnType<typeof vi.fn> };
  let cache: { [K in keyof CacheInvalidator]: ReturnType<typeof vi.fn> };
  let service: ReservationService;

  beforeEach(() => {
    reservations = {
      create: vi.fn(),
      findById: vi.fn(),
      findOverlapping: vi.fn().mockResolvedValue([]),
      listByUser: vi.fn(),
      listConfirmedForSpaceBetween: vi.fn(),
      listActiveAt: vi.fn(),
      cancel: vi.fn(),
    };
    spaces = {
      list: vi.fn(),
      findById: vi.fn().mockResolvedValue(space),
      findByBuildingAndName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    notifications = { notify: vi.fn().mockResolvedValue(true) };
    cache = { spaceReservationsChanged: vi.fn(), spaceChanged: vi.fn() };
    service = new ReservationService({
      reservations: reservations as unknown as ReservationRepository,
      spaces: spaces as unknown as SpaceRepository,
      notifications: notifications as unknown as NotificationService,
      cache: cache as unknown as CacheInvalidator,
      now: () => NOW,
    });
  });

  describe('create', () => {
    it('crea la reserva, invalida la caché del espacio y notifica la confirmación', async () => {
      reservations.create.mockResolvedValue(reservation());
      const result = await service.create(docente, input('09:00', '10:00'));

      expect(reservations.create).toHaveBeenCalledWith({
        spaceId: space.id,
        userId: docente.id,
        startAt: new Date('2026-11-11T15:00:00Z'),
        endAt: new Date('2026-11-11T16:00:00Z'),
        purpose: 'Clase',
      });
      expect(result).toMatchObject({ status: 'CONFIRMED', startAt: '2026-11-11T15:00:00.000Z' });
      expect(cache.spaceReservationsChanged).toHaveBeenCalledWith(space.id);
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'reservation.confirmed', spaceName: 'Lab 1' }),
      );
    });

    it('responde 409 si hay traslape y no crea ni notifica', async () => {
      reservations.findOverlapping.mockResolvedValue([reservation()]);
      await expect(service.create(docente, input('09:30', '10:30'))).rejects.toMatchObject({
        status: 409,
        code: 'RESERVATION_OVERLAP',
      });
      expect(reservations.create).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('propaga el 409 que el repositorio obtiene de la base (carrera entre solicitudes)', async () => {
      const { ConflictError } = await import('../../src/errors');
      reservations.create.mockRejectedValue(new ConflictError('ocupado', 'RESERVATION_OVERLAP'));
      await expect(service.create(docente, input('09:00', '10:00'))).rejects.toMatchObject({ status: 409 });
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it.each([
      ['fin antes del inicio', '10:00', '09:00', 'INVALID_RESERVATION_TIME'],
      ['fin igual al inicio', '10:00', '10:00', 'INVALID_RESERVATION_TIME'],
      ['más de 4 horas', '08:00', '12:30', 'INVALID_RESERVATION_TIME'],
      ['antes de abrir', '06:00', '08:00', 'OUTSIDE_SPACE_HOURS'],
      ['después de cerrar', '20:00', '21:30', 'OUTSIDE_SPACE_HOURS'],
    ])('rechaza con 422: %s', async (_name, start, end, code) => {
      await expect(service.create(docente, input(start, end))).rejects.toMatchObject({ status: 422, code });
      expect(reservations.create).not.toHaveBeenCalled();
    });

    it('acepta exactamente 4 horas y el horario completo hasta el cierre', async () => {
      reservations.create.mockResolvedValue(reservation());
      await expect(service.create(docente, input('17:00', '21:00'))).resolves.toBeDefined();
    });

    it('rechaza reservas en el pasado', async () => {
      await expect(
        service.create(docente, {
          ...input('09:00', '10:00'),
          startAt: '2026-11-09T09:00:00-06:00',
          endAt: '2026-11-09T10:00:00-06:00',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rechaza una reserva que cruza la medianoche', async () => {
      spaces.findById.mockResolvedValue({ ...space, openTime: '00:00', closeTime: '23:59' });
      await expect(
        service.create(docente, {
          ...input('09:00', '10:00'),
          startAt: '2026-11-11T23:00:00-06:00',
          endAt: '2026-11-12T01:00:00-06:00',
        }),
      ).rejects.toMatchObject({ code: 'OUTSIDE_SPACE_HOURS' });
    });

    it('responde 404 si el espacio no existe o está inactivo', async () => {
      spaces.findById.mockResolvedValue({ ...space, active: false });
      await expect(service.create(docente, input('09:00', '10:00'))).rejects.toMatchObject({ status: 404 });
      spaces.findById.mockResolvedValue(null);
      await expect(service.create(docente, input('09:00', '10:00'))).rejects.toMatchObject({ status: 404 });
    });

    it('si el servicio de notificaciones falla, la reserva se crea igual', async () => {
      reservations.create.mockResolvedValue(reservation());
      notifications.notify.mockRejectedValue(new Error('Mockoon caído'));
      await expect(service.create(docente, input('09:00', '10:00'))).resolves.toMatchObject({
        status: 'CONFIRMED',
      });
    });
  });

  describe('cancel', () => {
    it('el dueño cancela: invalida la caché y notifica la cancelación', async () => {
      reservations.findById.mockResolvedValue(reservation());
      reservations.cancel.mockResolvedValue(reservation({ status: 'CANCELLED' }));
      const result = await service.cancel(docente, reservation().id);
      expect(result.status).toBe('CANCELLED');
      expect(cache.spaceReservationsChanged).toHaveBeenCalledWith(space.id);
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'reservation.cancelled' }),
      );
    });

    it('un administrador puede cancelar la reserva de otro', async () => {
      reservations.findById.mockResolvedValue(reservation());
      reservations.cancel.mockResolvedValue(reservation({ status: 'CANCELLED' }));
      await expect(service.cancel(admin, reservation().id)).resolves.toBeDefined();
    });

    it('otro docente recibe 403', async () => {
      reservations.findById.mockResolvedValue(reservation());
      await expect(service.cancel(otroDocente, reservation().id)).rejects.toMatchObject({ status: 403 });
      expect(reservations.cancel).not.toHaveBeenCalled();
    });

    it('404 si no existe y 409 si ya estaba cancelada', async () => {
      reservations.findById.mockResolvedValue(null);
      await expect(service.cancel(docente, 'x')).rejects.toMatchObject({ status: 404 });
      reservations.findById.mockResolvedValue(reservation({ status: 'CANCELLED' }));
      await expect(service.cancel(docente, 'x')).rejects.toMatchObject({ status: 409 });
    });
  });

  it('listMine devuelve las reservas del usuario como DTO', async () => {
    reservations.listByUser.mockResolvedValue([reservation()]);
    const result = await service.listMine(docente.id);
    expect(reservations.listByUser).toHaveBeenCalledWith(docente.id);
    expect(result[0]).toMatchObject({ space: { name: 'Lab 1' }, createdAt: NOW.toISOString() });
  });
});
