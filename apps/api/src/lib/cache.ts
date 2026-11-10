import type { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Almacén de caché y contadores sobre Redis. Todas las operaciones son
 * "tolerantes a fallos": si Redis no está disponible devuelven null / no hacen
 * nada, y la API sigue respondiendo sin caché (Redis es una optimización).
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Borra las claves que coinciden con los patrones (usa SCAN, nunca KEYS). */
  deleteMatching(...patterns: string[]): Promise<number>;
  /** INCR + EXPIRE en una sola ida y vuelta. Devuelve null si Redis no responde. */
  increment(key: string, ttlSeconds: number): Promise<number | null>;
}

/** Nombres de las claves de caché. Centralizados para que middleware e invalidación coincidan. */
export function cacheKeys(prefix: string) {
  return {
    spacesList: (query: string) => `${prefix}cache:spaces:list:${query}`,
    availability: (spaceId: string, date: string) => `${prefix}cache:space:${spaceId}:availability:${date}`,
    now: () => `${prefix}cache:now`,
    rateLimit: (apiKeyId: string, window: number) => `${prefix}ratelimit:${apiKeyId}:${window}`,
    /** Patrones a borrar cuando cambian las reservas de un espacio. */
    affectedBySpaceReservations: (spaceId: string) => [
      `${prefix}cache:space:${spaceId}:*`,
      `${prefix}cache:now`,
    ],
    /** Patrones a borrar cuando cambian los datos de un espacio (nombre, horario, borrado). */
    affectedBySpaceChange: (spaceId: string) => [
      `${prefix}cache:spaces:list:*`,
      `${prefix}cache:space:${spaceId}:*`,
      `${prefix}cache:now`,
    ],
  };
}
export type CacheKeys = ReturnType<typeof cacheKeys>;

function isReady(redis: Redis): boolean {
  return redis.status === 'ready';
}

export function createRedisCacheStore(redis: Redis): CacheStore {
  const warn = (op: string, err: unknown) =>
    logger.warn(
      { err: err instanceof Error ? err.message : err, op },
      'Redis no disponible, se omite la caché',
    );

  return {
    async get(key) {
      if (!isReady(redis)) return null;
      try {
        return await redis.get(key);
      } catch (err) {
        warn('get', err);
        return null;
      }
    },

    async set(key, value, ttlSeconds) {
      if (!isReady(redis)) return;
      try {
        await redis.set(key, value, 'EX', ttlSeconds);
      } catch (err) {
        warn('set', err);
      }
    },

    async deleteMatching(...patterns) {
      if (!isReady(redis)) return 0;
      let deleted = 0;
      try {
        for (const pattern of patterns) {
          let cursor = '0';
          do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = next;
            if (keys.length > 0) deleted += await redis.del(...keys);
          } while (cursor !== '0');
        }
      } catch (err) {
        warn('deleteMatching', err);
      }
      return deleted;
    },

    async increment(key, ttlSeconds) {
      if (!isReady(redis)) return null;
      try {
        const result = await redis.multi().incr(key).expire(key, ttlSeconds, 'NX').exec();
        const count = result?.[0]?.[1];
        return typeof count === 'number' ? count : null;
      } catch (err) {
        warn('increment', err);
        return null;
      }
    },
  };
}

/** Invalidación de caché que usan los servicios, sin conocer los nombres de las claves. */
export interface CacheInvalidator {
  /** Tras crear o cancelar una reserva: disponibilidad del espacio y /now. */
  spaceReservationsChanged(spaceId: string): Promise<void>;
  /** Tras crear, editar o borrar un espacio: listados, disponibilidad y /now. */
  spaceChanged(spaceId: string): Promise<void>;
}

export function createCacheInvalidator(store: CacheStore, keys: CacheKeys): CacheInvalidator {
  return {
    async spaceReservationsChanged(spaceId) {
      await store.deleteMatching(...keys.affectedBySpaceReservations(spaceId));
    },
    async spaceChanged(spaceId) {
      await store.deleteMatching(...keys.affectedBySpaceChange(spaceId));
    },
  };
}

/** Invalidador que no hace nada (pruebas unitarias o sin Redis). */
export const noopCacheInvalidator: CacheInvalidator = {
  spaceReservationsChanged: async () => undefined,
  spaceChanged: async () => undefined,
};
