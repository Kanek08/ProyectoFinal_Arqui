import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  createSpace,
  createUser,
  guatemalaDate,
  gt,
  loginAs,
  recordingNotifier,
  resetDatabase,
  testPrisma,
} from '../helpers';

const notifier = recordingNotifier();
const { app, redis, resetCache } = buildTestApp({ notifications: notifier });
const DAY = guatemalaDate(2);

let docenteToken: string;
let otroDocenteToken: string;
let adminToken: string;
let estudianteToken: string;
let spaceId: string;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const reserve = (token: string, start = '09:00', end = '10:00', extra: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/v1/reservations')
    .set(bearer(token))
    .send({ spaceId, startAt: gt(DAY, start), endAt: gt(DAY, end), purpose: 'Clase de prueba', ...extra });

afterAll(async () => {
  redis.disconnect();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  await resetCache();
  notifier.sent.length = 0;
  await Promise.all([
    createUser('DOCENTE'),
    createUser('DOCENTE', 'otro.docente@test.edu'),
    createUser('ADMIN'),
    createUser('ESTUDIANTE'),
  ]);
  spaceId = (await createSpace()).id;
  [docenteToken, otroDocenteToken, adminToken, estudianteToken] = (
    await Promise.all([
      loginAs(app, 'docente@test.edu'),
      loginAs(app, 'otro.docente@test.edu'),
      loginAs(app, 'admin@test.edu'),
      loginAs(app, 'estudiante@test.edu'),
    ])
  ).map((t) => t.accessToken) as [string, string, string, string];
});

describe('Reservas (RF-08 a RF-10)', () => {
  it('login -> reservar -> listar mis reservas, y notifica la confirmación', async () => {
    const res = await reserve(docenteToken);
    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/\/reservations\/[0-9a-f-]{36}$/);
    expect(res.body).toMatchObject({ spaceId, status: 'CONFIRMED', space: { name: 'Laboratorio 1' } });

    const mine = await request(app).get('/api/v1/reservations/me').set(bearer(docenteToken));
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toMatchObject({ event: 'reservation.confirmed', reservationId: res.body.id });
  });

  it('rechaza un traslape con 409 y no notifica', async () => {
    expect((await reserve(docenteToken, '09:00', '11:00')).status).toBe(201);
    const overlap = await reserve(otroDocenteToken, '10:00', '12:00');
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('RESERVATION_OVERLAP');
    expect(notifier.sent).toHaveLength(1);

    // Reserva contigua [11:00, 12:00): no se traslapa.
    expect((await reserve(otroDocenteToken, '11:00', '12:00')).status).toBe(201);
  });

  it('dos solicitudes simultáneas al mismo horario: una 201 y otra 409 (restricción de la base)', async () => {
    const results = await Promise.all([
      reserve(docenteToken, '14:00', '16:00'),
      reserve(otroDocenteToken, '15:00', '17:00'),
      reserve(adminToken, '14:30', '15:30'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(await testPrisma.reservation.count({ where: { status: 'CONFIRMED' } })).toBe(1);
  });

  it('un estudiante no puede reservar (403)', async () => {
    const res = await reserve(estudianteToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('valida las reglas de horario con 422', async () => {
    const cases: [string, string, string][] = [
      ['10:00', '09:00', 'INVALID_RESERVATION_TIME'], // fin antes del inicio
      ['08:00', '13:00', 'INVALID_RESERVATION_TIME'], // más de 4 horas
      ['06:00', '08:00', 'OUTSIDE_SPACE_HOURS'], // abre a las 07:00
      ['20:00', '22:00', 'OUTSIDE_SPACE_HOURS'], // cierra a las 21:00
    ];
    for (const [start, end, code] of cases) {
      const res = await reserve(docenteToken, start, end);
      expect(res.status, `${start}-${end}`).toBe(422);
      expect(res.body.error.code).toBe(code);
    }

    const past = await request(app)
      .post('/api/v1/reservations')
      .set(bearer(docenteToken))
      .send({
        spaceId,
        startAt: gt(guatemalaDate(-1), '09:00'),
        endAt: gt(guatemalaDate(-1), '10:00'),
        purpose: 'Ayer',
      });
    expect(past.status).toBe(422);

    const badBody = await request(app)
      .post('/api/v1/reservations')
      .set(bearer(docenteToken))
      .send({ spaceId: 'x' });
    expect(badBody.status).toBe(422);
    expect(badBody.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cancelar: 403 si no es el dueño, 204 el dueño, 409 si ya estaba cancelada, y libera el horario', async () => {
    const { body } = await reserve(docenteToken);

    const ajeno = await request(app).delete(`/api/v1/reservations/${body.id}`).set(bearer(otroDocenteToken));
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error.code).toBe('NOT_RESERVATION_OWNER');

    const ok = await request(app).delete(`/api/v1/reservations/${body.id}`).set(bearer(docenteToken));
    expect(ok.status).toBe(204);
    expect(notifier.sent.map((n) => n.event)).toEqual(['reservation.confirmed', 'reservation.cancelled']);

    const again = await request(app).delete(`/api/v1/reservations/${body.id}`).set(bearer(docenteToken));
    expect(again.status).toBe(409);

    expect((await reserve(otroDocenteToken)).status).toBe(201);
  });

  it('un administrador puede cancelar la reserva de otro; 404 si no existe', async () => {
    const { body } = await reserve(docenteToken);
    const res = await request(app).delete(`/api/v1/reservations/${body.id}`).set(bearer(adminToken));
    expect(res.status).toBe(204);

    const missing = await request(app)
      .delete('/api/v1/reservations/00000000-0000-4000-8000-000000000000')
      .set(bearer(adminToken));
    expect(missing.status).toBe(404);
  });

  it('las reservas exigen JWT (401 sin token)', async () => {
    expect((await request(app).get('/api/v1/reservations/me')).status).toBe(401);
  });
});

describe('Disponibilidad (RF-07) y caché', () => {
  const availability = (token: string) =>
    request(app).get(`/api/v1/spaces/${spaceId}/availability?date=${DAY}`).set(bearer(token));

  it('devuelve bloques de 1 hora del horario del espacio, con los ocupados marcados', async () => {
    await reserve(docenteToken, '09:00', '11:00');
    const res = await availability(estudianteToken);
    expect(res.status).toBe(200);
    expect(res.body.blocks).toHaveLength(14); // 07:00 a 21:00
    expect(res.body.blocks[0]).toMatchObject({ startTime: '07:00', endTime: '08:00', status: 'FREE' });
    const busy = res.body.blocks.filter((b: { status: string }) => b.status === 'BUSY');
    expect(busy.map((b: { startTime: string }) => b.startTime)).toEqual(['09:00', '10:00']);
  });

  it('X-Cache: MISS -> HIT -> reservar -> MISS (la caché se invalida)', async () => {
    const first = await availability(docenteToken);
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await availability(docenteToken);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);

    expect((await reserve(docenteToken, '12:00', '13:00')).status).toBe(201);

    const third = await availability(docenteToken);
    expect(third.headers['x-cache']).toBe('MISS');
    const noon = third.body.blocks.find((b: { startTime: string }) => b.startTime === '12:00');
    expect(noon.status).toBe('BUSY');
  });

  it('valida la fecha (422) y el espacio (404)', async () => {
    const bad = await request(app)
      .get(`/api/v1/spaces/${spaceId}/availability?date=2026-02-31`)
      .set(bearer(docenteToken));
    expect(bad.status).toBe(422);
    const missing = await request(app)
      .get(`/api/v1/spaces/00000000-0000-4000-8000-000000000000/availability?date=${DAY}`)
      .set(bearer(docenteToken));
    expect(missing.status).toBe(404);
  });
});

describe('Refresh después de logout', () => {
  it('responde 401', async () => {
    const tokens = await loginAs(app, 'docente@test.edu');
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set(bearer(tokens.accessToken))
      .send({ refreshToken: tokens.refreshToken });
    expect(logout.status).toBe(204);
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(refresh.status).toBe(401);
  });
});
