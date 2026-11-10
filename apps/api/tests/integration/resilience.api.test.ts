import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpNotificationService } from '../../src/services/notification.service';
import { createReservationRepository } from '../../src/repositories/reservation.repository';
import {
  buildTestApp,
  createSpace,
  createUser,
  guatemalaDate,
  gt,
  loginAs,
  resetDatabase,
  testPrisma,
} from '../helpers';

const silentLogger = { info: () => undefined, error: () => undefined };

describe('Si Redis cae, la API sigue funcionando sin caché', () => {
  // Puerto donde no hay ningún Redis escuchando.
  const { app, redis } = buildTestApp({ redisUrl: 'redis://127.0.0.1:6399' });

  beforeAll(async () => {
    await resetDatabase();
    await createUser('DOCENTE');
    await createSpace();
  });

  afterAll(() => redis.disconnect());

  it('responde 200 con X-Cache: MISS y permite reservar', async () => {
    const { accessToken } = await loginAs(app, 'docente@test.edu');
    const auth = { Authorization: `Bearer ${accessToken}` };

    const list = await request(app).get('/api/v1/spaces').set(auth);
    expect(list.status).toBe(200);
    expect(list.headers['x-cache']).toBe('MISS');
    expect((await request(app).get('/api/v1/spaces').set(auth)).headers['x-cache']).toBe('MISS');

    const res = await request(app)
      .post('/api/v1/reservations')
      .set(auth)
      .send({
        spaceId: list.body[0].id,
        startAt: gt(guatemalaDate(1), '09:00'),
        endAt: gt(guatemalaDate(1), '10:00'),
        purpose: 'Sin Redis',
      });
    expect(res.status).toBe(201);

    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(503);
    expect(health.body.services).toMatchObject({ database: 'up', cache: 'down' });
  });
});

describe('Si el servicio de notificaciones no responde, la reserva no se rompe', () => {
  // Nada escucha en el puerto 9: el fetch falla y el servicio solo registra el error.
  const notifications = createHttpNotificationService({
    baseUrl: 'http://127.0.0.1:9',
    timeoutMs: 500,
    logger: silentLogger,
  });
  const { app, redis, resetCache } = buildTestApp({ notifications });

  afterAll(() => redis.disconnect());

  it('crea y cancela con 201/204', async () => {
    await resetDatabase();
    await resetCache();
    await createUser('DOCENTE');
    const space = await createSpace();
    const { accessToken } = await loginAs(app, 'docente@test.edu');
    const auth = { Authorization: `Bearer ${accessToken}` };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set(auth)
      .send({
        spaceId: space.id,
        startAt: gt(guatemalaDate(1), '15:00'),
        endAt: gt(guatemalaDate(1), '16:00'),
        purpose: 'Mock caído',
      });
    expect(res.status).toBe(201);
    expect((await request(app).delete(`/api/v1/reservations/${res.body.id}`).set(auth)).status).toBe(204);
  });
});

describe('El repositorio traduce el error 23P01 de PostgreSQL a 409', () => {
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('aunque el servicio no haya validado antes', async () => {
    await resetDatabase();
    const user = await createUser('DOCENTE');
    const space = await createSpace();
    const repo = createReservationRepository(testPrisma);
    const data = {
      spaceId: space.id,
      userId: user.id,
      startAt: new Date(gt(guatemalaDate(1), '09:00')),
      endAt: new Date(gt(guatemalaDate(1), '11:00')),
      purpose: 'Directo',
    };
    await repo.create(data);
    await expect(
      repo.create({ ...data, startAt: new Date(gt(guatemalaDate(1), '10:00')) }),
    ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_OVERLAP' });
  });
});
