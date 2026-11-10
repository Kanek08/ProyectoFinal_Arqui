import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createUser, loginAs, resetDatabase, testPrisma } from '../helpers';

const { app, redis, resetCache } = buildTestApp();

afterAll(async () => {
  redis.disconnect();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  await resetCache();
});

describe('Auth (RF-01 a RF-04) de punta a punta', () => {
  it('registra, inicia sesión, refresca con rotación y cierra sesión', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ana', email: 'ANA@test.edu', password: 'Password123!' });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ email: 'ana@test.edu', role: 'ESTUDIANTE' });

    const dup = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ana', email: 'ana@test.edu', password: 'Password123!' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@test.edu', password: 'Password123!' });
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = login.body;

    const stored = await testPrisma.refreshToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(refreshToken);
    expect(stored.tokenHash).toHaveLength(64);

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    // El token anterior quedó revocado por la rotación.
    const reused = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reused.status).toBe(401);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: refreshed.body.refreshToken });
    expect(logout.status).toBe(204);
    expect(await testPrisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('valida el cuerpo con 422 y detalle por campo', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-correo', password: '1' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('responde 400 ante JSON mal formado', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('logout exige access token', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });
});

describe('Espacios (RF-05 y RF-06)', () => {
  const nuevo = {
    name: 'Lab IA',
    building: 'Edificio C',
    capacity: 24,
    openTime: '07:00',
    closeTime: '20:00',
  };

  it('rechaza sin token (401) y con token inválido (401)', async () => {
    expect((await request(app).get('/api/v1/spaces')).status).toBe(401);
    const res = await request(app).get('/api/v1/spaces').set('Authorization', 'Bearer basura');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('solo ADMIN gestiona espacios; docente recibe 403', async () => {
    await createUser('DOCENTE', 'doc@test.edu');
    const { accessToken } = await loginAs(app, 'doc@test.edu');
    const res = await request(app)
      .post('/api/v1/spaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(nuevo);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('ADMIN crea, filtra, actualiza y borra lógicamente', async () => {
    await createUser('ADMIN', 'admin@test.edu');
    const { accessToken } = await loginAs(app, 'admin@test.edu');
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await request(app).post('/api/v1/spaces').set(auth).send(nuevo);
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const dup = await request(app).post('/api/v1/spaces').set(auth).send(nuevo);
    expect(dup.status).toBe(409);

    await request(app)
      .post('/api/v1/spaces')
      .set(auth)
      .send({ ...nuevo, name: 'Salón pequeño', capacity: 10 });

    const filtered = await request(app).get('/api/v1/spaces?building=edificio c&minCapacity=20').set(auth);
    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);

    const badQuery = await request(app).get('/api/v1/spaces?minCapacity=-3').set(auth);
    expect(badQuery.status).toBe(422);

    const patched = await request(app).patch(`/api/v1/spaces/${id}`).set(auth).send({ capacity: 30 });
    expect(patched.status).toBe(200);
    expect(patched.body.capacity).toBe(30);

    const deleted = await request(app).delete(`/api/v1/spaces/${id}`).set(auth);
    expect(deleted.status).toBe(204);
    expect((await request(app).get(`/api/v1/spaces/${id}`).set(auth)).status).toBe(404);
    expect((await testPrisma.space.findUniqueOrThrow({ where: { id } })).active).toBe(false);

    const notFound = await request(app).patch('/api/v1/spaces/not-a-uuid').set(auth).send({ capacity: 1 });
    expect(notFound.status).toBe(422);
  });
});

describe('Health (RF-13) y errores generales', () => {
  it('reporta el estado de la base y la caché', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body.services.database).toBe('up');
    expect(res.body.services.api).toBe('up');
  });

  it('rutas inexistentes devuelven 404 con el formato de error', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) } });
  });
});
