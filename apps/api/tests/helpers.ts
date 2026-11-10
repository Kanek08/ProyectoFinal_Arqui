import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createApp } from '../src/app';
import { buildContainer } from '../src/container';
import { generateApiKey } from '../src/lib/crypto';
import { createPrismaClient } from '../src/lib/prisma';
import type { PasswordHasher } from '../src/lib/password';
import type { NotificationService, ReservationNotification } from '../src/services/notification.service';

/** Hasher rápido para pruebas de integración (argon2 real se prueba aparte). */
export const fastHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async (hash, plain) => hash === `hashed:${plain}`,
};

export const testPrisma: PrismaClient = createPrismaClient(process.env.DATABASE_URL_TEST);

export async function resetDatabase() {
  await testPrisma.$executeRawUnsafe(
    'TRUNCATE TABLE reservations, refresh_tokens, api_keys, spaces, users RESTART IDENTITY CASCADE',
  );
}

/** Servicio de notificaciones falso que solo registra lo que se le envía. */
export function recordingNotifier(): NotificationService & { sent: ReservationNotification[] } {
  const sent: ReservationNotification[] = [];
  return {
    sent,
    notify: async (n) => {
      sent.push(n);
      return true;
    },
  };
}

export interface TestAppOptions {
  redisUrl?: string;
  rateLimitPerMinute?: number;
  notifications?: NotificationService;
}

/**
 * App de pruebas: Postgres real (reservalab_test) y Redis real con un prefijo de
 * claves único por archivo, para no chocar con los datos de desarrollo.
 */
export function buildTestApp(options: TestAppOptions = {}) {
  const redisDown = Boolean(options.redisUrl);
  const redis = new Redis(options.redisUrl ?? process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    ...(redisDown ? { retryStrategy: () => null } : {}),
  });
  redis.on('error', () => undefined);
  const connected = redis.connect().catch(() => undefined);

  const prefix = `rl-test:${randomUUID().slice(0, 8)}:`;
  const notifications = options.notifications ?? recordingNotifier();
  const container = buildContainer({
    prisma: testPrisma,
    redis,
    hasher: fastHasher,
    notifications,
    config: { redisKeyPrefix: prefix, rateLimitPerMinute: options.rateLimitPerMinute ?? 1000 },
  });
  const app = createApp(container);

  return {
    app,
    redis,
    notifications,
    /** Espera la conexión a Redis y borra las claves de este archivo de pruebas. */
    async resetCache() {
      await connected;
      await container.cacheStore.deleteMatching(`${prefix}*`);
    },
  };
}

export async function createUser(
  role: 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE',
  email = `${role.toLowerCase()}@test.edu`,
) {
  return testPrisma.user.create({
    data: { name: `Usuario ${role}`, email, passwordHash: await fastHasher.hash('Password123!'), role },
  });
}

export async function loginAs(app: Parameters<typeof request>[0], email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return res.body as { accessToken: string; refreshToken: string };
}

export async function createSpace(overrides: Partial<{ name: string; building: string }> = {}) {
  return testPrisma.space.create({
    data: {
      name: overrides.name ?? 'Laboratorio 1',
      building: overrides.building ?? 'Edificio A',
      capacity: 30,
      openTime: '07:00',
      closeTime: '21:00',
    },
  });
}

/** Crea una API key directamente en la base y devuelve la key en texto plano. */
export async function createApiKey(permissions: string[], extra: { revokedAt?: Date } = {}) {
  const generated = generateApiKey();
  const record = await testPrisma.apiKey.create({
    data: {
      name: `Key ${permissions.join(',')}`,
      prefix: generated.prefix,
      keyHash: generated.hash,
      permissions,
      revokedAt: extra.revokedAt ?? null,
    },
  });
  return { key: generated.key, record };
}

/** Fecha local de Guatemala (YYYY-MM-DD) a N días de hoy. */
export function guatemalaDate(daysFromToday: number): string {
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/** Instante ISO con zona -06:00 para una fecha local y una hora HH:MM. */
export function gt(date: string, time: string): string {
  return `${date}T${time}:00-06:00`;
}
