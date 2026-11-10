import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  createApiKey,
  createSpace,
  createUser,
  guatemalaDate,
  gt,
  loginAs,
  resetDatabase,
  testPrisma,
} from '../helpers';

const RATE_LIMIT = 3;
const { app, redis, resetCache } = buildTestApp({ rateLimitPerMinute: RATE_LIMIT });

let adminToken: string;
let docenteToken: string;

afterAll(async () => {
  redis.disconnect();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  await resetCache();
  await Promise.all([createUser('ADMIN'), createUser('DOCENTE')]);
  adminToken = (await loginAs(app, 'admin@test.edu')).accessToken;
  docenteToken = (await loginAs(app, 'docente@test.edu')).accessToken;
});

describe('Gestión de API keys (RF-12)', () => {
  it('crea una key rl_live_ + 32 caracteres, guarda solo el hash, lista sin hash y revoca', async () => {
    const created = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Pantalla Edificio A', permissions: ['read:now', 'read:now', 'read:spaces'] });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^rl_live_[A-Za-z0-9_-]{32}$/);
    expect(created.body.permissions).toEqual(['read:now', 'read:spaces']);
    expect(created.body.key.startsWith(created.body.prefix)).toBe(true);

    const stored = await testPrisma.apiKey.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.keyHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(created.body.key);

    const list = await request(app).get('/api/v1/api-keys').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body[0]).not.toHaveProperty('key');
    expect(list.body[0]).not.toHaveProperty('keyHash');

    // La key funciona y actualiza lastUsedAt.
    const now = await request(app).get('/api/v1/now').set('X-API-Key', created.body.key);
    expect(now.status).toBe(200);
    const used = await testPrisma.apiKey.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(used.lastUsedAt).not.toBeNull();

    const revoke = await request(app)
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoke.status).toBe(204);

    const after = await request(app).get('/api/v1/now').set('X-API-Key', created.body.key);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('API_KEY_REVOKED');
  });

  it('solo el administrador gestiona keys (403 docente, 422 permisos inválidos, 404 inexistente)', async () => {
    const asDocente = await request(app)
      .get('/api/v1/api-keys')
      .set('Authorization', `Bearer ${docenteToken}`);
    expect(asDocente.status).toBe(403);

    const invalid = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Mala', permissions: ['write:everything'] });
    expect(invalid.status).toBe(422);

    const missing = await request(app)
      .delete('/api/v1/api-keys/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });
});

describe('Uso de API keys: requireApiKey y requireUserOrApiKey', () => {
  it('sin key 401, key inexistente 401, key revocada 401, key sin permiso 403', async () => {
    const noKey = await request(app).get('/api/v1/now');
    expect(noKey.status).toBe(401);
    expect(noKey.body.error.code).toBe('MISSING_API_KEY');

    const fake = await request(app)
      .get('/api/v1/now')
      .set('X-API-Key', `rl_live_${'x'.repeat(32)}`);
    expect(fake.status).toBe(401);

    const { key: revoked } = await createApiKey(['read:now'], { revokedAt: new Date() });
    expect((await request(app).get('/api/v1/now').set('X-API-Key', revoked)).status).toBe(401);

    const { key: spacesOnly } = await createApiKey(['read:spaces']);
    const forbidden = await request(app).get('/api/v1/now').set('X-API-Key', spacesOnly);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('MISSING_PERMISSION');
  });

  it('GET /spaces y /availability aceptan JWT o API key con el permiso correcto', async () => {
    const space = await createSpace();
    const { key: spacesKey } = await createApiKey(['read:spaces']);
    const { key: availabilityKey } = await createApiKey(['read:availability']);
    const url = `/api/v1/spaces/${space.id}/availability?date=${guatemalaDate(1)}`;

    expect((await request(app).get('/api/v1/spaces').set('X-API-Key', spacesKey)).status).toBe(200);
    expect((await request(app).get('/api/v1/spaces').set('X-API-Key', availabilityKey)).status).toBe(403);
    expect((await request(app).get(url).set('X-API-Key', availabilityKey)).status).toBe(200);
    expect((await request(app).get(url).set('X-API-Key', spacesKey)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${docenteToken}`)).status).toBe(200);
  });

  it('GET /now no acepta JWT: es solo para la pantalla con API key', async () => {
    const res = await request(app).get('/api/v1/now').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });

  it('GET /now agrupa por edificio, marca lo ocupado y usa caché que se invalida al reservar', async () => {
    const space = await createSpace({ name: 'Lab Redes', building: 'Edificio B' });
    await createSpace({ name: 'Salón 1', building: 'Edificio B' });
    const docente = await testPrisma.user.findUniqueOrThrow({ where: { email: 'docente@test.edu' } });
    const start = new Date(Date.now() - 30 * 60 * 1000);
    await testPrisma.reservation.create({
      data: {
        spaceId: space.id,
        userId: docente.id,
        startAt: start,
        endAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Clase en curso',
      },
    });
    const { key } = await createApiKey(['read:now']);

    const first = await request(app).get('/api/v1/now').set('X-API-Key', key);
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.body.buildings).toHaveLength(1);
    expect(first.body.buildings[0]).toMatchObject({ building: 'Edificio B', total: 2, occupied: 1 });
    const redes = first.body.buildings[0].spaces.find((s: { name: string }) => s.name === 'Lab Redes');
    expect(redes).toMatchObject({ status: 'BUSY', current: { purpose: 'Clase en curso' } });

    expect((await request(app).get('/api/v1/now').set('X-API-Key', key)).headers['x-cache']).toBe('HIT');

    // Una reserva nueva en cualquier espacio invalida /now.
    const created = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${docenteToken}`)
      .send({
        spaceId: space.id,
        startAt: gt(guatemalaDate(3), '09:00'),
        endAt: gt(guatemalaDate(3), '10:00'),
        purpose: 'Otra clase',
      });
    expect(created.status).toBe(201);
    expect((await request(app).get('/api/v1/now').set('X-API-Key', key)).headers['x-cache']).toBe('MISS');
  });
});

describe('Límite de solicitudes por API key', () => {
  it(`responde 429 con Retry-After al pasar de ${RATE_LIMIT} solicitudes por minuto`, async () => {
    const { key } = await createApiKey(['read:now']);
    for (let i = 0; i < RATE_LIMIT; i++) {
      const ok = await request(app).get('/api/v1/now').set('X-API-Key', key);
      expect(ok.status).toBe(200);
      expect(ok.headers['x-ratelimit-remaining']).toBe(String(RATE_LIMIT - i - 1));
    }
    const blocked = await request(app).get('/api/v1/now').set('X-API-Key', key);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // Otra key tiene su propio contador.
    const { key: other } = await createApiKey(['read:now']);
    expect((await request(app).get('/api/v1/now').set('X-API-Key', other)).status).toBe(200);
  });
});
