import type { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createApp } from '../src/app';
import { buildContainer } from '../src/container';
import { createPrismaClient } from '../src/lib/prisma';
import type { PasswordHasher } from '../src/lib/password';

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

export function buildTestApp() {
  const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  });
  redis.on('error', () => undefined);
  const app = createApp(buildContainer({ prisma: testPrisma, redis, hasher: fastHasher }));
  return { app, redis };
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
