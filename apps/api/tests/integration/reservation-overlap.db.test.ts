import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, resetDatabase, testPrisma } from '../helpers';

/**
 * Prueba la restricción EXCLUDE de PostgreSQL directamente, sin pasar por
 * el servicio: demuestra que la base protege la regla aunque la aplicación falle.
 */
describe('restricción de traslape en PostgreSQL', () => {
  let spaceId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    userId = (await createUser('DOCENTE')).id;
    spaceId = (
      await testPrisma.space.create({
        data: { name: 'Lab', building: 'A', capacity: 20, openTime: '07:00', closeTime: '21:00' },
      })
    ).id;
    await testPrisma.reservation.create({
      data: {
        spaceId,
        userId,
        startAt: new Date('2026-11-10T14:00:00Z'),
        endAt: new Date('2026-11-10T16:00:00Z'),
        purpose: 'Original',
      },
    });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const insert = (start: string, end: string, extra: Record<string, unknown> = {}) =>
    testPrisma.reservation.create({
      data: { spaceId, userId, startAt: new Date(start), endAt: new Date(end), purpose: 'Otra', ...extra },
    });

  it('rechaza una reserva CONFIRMED que se traslapa en el mismo espacio', async () => {
    await expect(insert('2026-11-10T15:00:00Z', '2026-11-10T17:00:00Z')).rejects.toThrow(
      /reservations_no_overlap|23P01|exclusion/i,
    );
  });

  it('rechaza un traslape aunque llegue con SQL directo (sin Prisma de por medio)', async () => {
    await expect(
      testPrisma.$executeRaw`
        INSERT INTO reservations (id, space_id, user_id, start_at, end_at, purpose, status, updated_at)
        VALUES (gen_random_uuid(), ${spaceId}::uuid, ${userId}::uuid,
                '2026-11-10T13:00:00Z', '2026-11-10T14:30:00Z', 'SQL', 'CONFIRMED', now())`,
    ).rejects.toThrow(/reservations_no_overlap|23P01/i);
  });

  it('permite una reserva contigua (rango semiabierto [inicio, fin))', async () => {
    await expect(insert('2026-11-10T16:00:00Z', '2026-11-10T18:00:00Z')).resolves.toBeDefined();
  });

  it('permite el mismo horario si la reserva existente está cancelada', async () => {
    await testPrisma.reservation.updateMany({ data: { status: 'CANCELLED' } });
    await expect(insert('2026-11-10T14:00:00Z', '2026-11-10T16:00:00Z')).resolves.toBeDefined();
  });

  it('rechaza una reserva cuyo fin no es posterior al inicio (CHECK)', async () => {
    await expect(insert('2026-11-11T10:00:00Z', '2026-11-11T10:00:00Z')).rejects.toThrow(
      /reservations_end_after_start|23514|check/i,
    );
  });
});
