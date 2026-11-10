import type { Request, RequestHandler } from 'express';
import type { CacheStore } from '../lib/cache';

/**
 * Caché de respuestas GET en Redis.
 * - HIT: responde con lo guardado y el encabezado X-Cache: HIT, sin llegar al controlador.
 * - MISS: deja pasar la solicitud, guarda la respuesta 200 por ttlSeconds y marca X-Cache: MISS.
 * Si Redis no está disponible, todas las respuestas son MISS y la API sigue funcionando.
 */
export function createCacheMiddleware(store: CacheStore, ttlSeconds: number) {
  return (keyFor: (req: Request) => string): RequestHandler =>
    async (req, res, next) => {
      const key = keyFor(req);
      const cached = await store.get(key);
      if (cached !== null) {
        res.set('X-Cache', 'HIT').type('application/json').send(cached);
        return;
      }

      res.set('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        if (res.statusCode === 200) {
          void store.set(key, JSON.stringify(body), ttlSeconds);
        }
        return originalJson(body);
      };
      next();
    };
}
