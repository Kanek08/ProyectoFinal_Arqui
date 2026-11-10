import type { RequestHandler } from 'express';
import { TooManyRequestsError } from '../errors';
import type { CacheKeys, CacheStore } from '../lib/cache';

const WINDOW_SECONDS = 60;

/**
 * Límite de solicitudes por API key con ventana fija de un minuto:
 * INCR sobre ratelimit:<keyId>:<minuto> y EXPIRE de 60 s. Al superarlo responde
 * 429 con Retry-After. Las solicitudes con JWT no se limitan aquí, y si Redis
 * no responde se deja pasar (se prefiere disponibilidad a bloquear por error).
 */
export function createRateLimit(
  store: CacheStore,
  keys: CacheKeys,
  limitPerMinute: number,
  now: () => number = Date.now,
): RequestHandler {
  return async (req, res, next) => {
    if (!req.apiKey) return next();

    const nowSeconds = Math.floor(now() / 1000);
    const window = Math.floor(nowSeconds / WINDOW_SECONDS);
    const count = await store.increment(keys.rateLimit(req.apiKey.id, window), WINDOW_SECONDS);
    if (count === null) return next();

    res.set('X-RateLimit-Limit', String(limitPerMinute));
    res.set('X-RateLimit-Remaining', String(Math.max(0, limitPerMinute - count)));

    if (count > limitPerMinute) {
      const retryAfter = (window + 1) * WINDOW_SECONDS - nowSeconds;
      res.set('Retry-After', String(retryAfter));
      return next(
        new TooManyRequestsError(`Límite de ${limitPerMinute} solicitudes por minuto superado`, {
          retryAfterSeconds: retryAfter,
        }),
      );
    }
    next();
  };
}
