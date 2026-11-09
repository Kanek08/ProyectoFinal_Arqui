import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

/** Comprueba la conectividad con las dependencias de infraestructura. */
export interface HealthRepository {
  pingDatabase(): Promise<boolean>;
  pingCache(): Promise<boolean>;
}

const TIMEOUT_MS = 2000;

async function withTimeout(check: () => Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), TIMEOUT_MS);
  });
  try {
    return await Promise.race([check().then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRepository(prisma: PrismaClient, redis: Redis): HealthRepository {
  return {
    pingDatabase: () => withTimeout(() => prisma.$queryRaw`SELECT 1`),
    pingCache: () =>
      withTimeout(async () => {
        if (redis.status === 'wait') await redis.connect();
        const pong = await redis.ping();
        if (pong !== 'PONG') throw new Error('Respuesta inesperada de Redis');
      }),
  };
}
