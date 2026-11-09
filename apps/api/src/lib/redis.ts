import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Cliente de Redis. Sin cola offline: si Redis cae, los comandos fallan rápido
 * y la API sigue respondiendo (la caché es una optimización, no una dependencia dura).
 */
export function createRedisClient(url: string = env.REDIS_URL): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  client.on('error', (err) => logger.warn({ err: err.message }, 'Redis no disponible'));
  return client;
}

export const redis = createRedisClient();
