import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { ApiKeyPermission } from '@reservalab/shared';
import type { Container } from '../container';
import type { CacheKeys } from '../lib/cache';
import { apiKeyRoutes } from './apiKey.routes';
import { authRoutes } from './auth.routes';
import { reservationRoutes } from './reservation.routes';
import { spaceRoutes } from './space.routes';

/** Middlewares reutilizables que reciben las rutas (se construyen en el contenedor). */
export interface RouteMiddleware {
  requireAuth: RequestHandler;
  requireApiKey: (permission: ApiKeyPermission) => RequestHandler;
  requireUserOrApiKey: (permission: ApiKeyPermission) => RequestHandler;
  rateLimit: RequestHandler;
  cache: (keyFor: (req: Request) => string) => RequestHandler;
  keys: CacheKeys;
}

/** Router raíz montado en /api/v1. */
export function apiRoutes(c: Container): Router {
  const mw = c.middleware;
  const router = Router();
  router.get('/health', c.controllers.health.check); // RF-13
  router.use('/auth', authRoutes(c.controllers.auth, mw.requireAuth));
  router.use('/spaces', spaceRoutes(c.controllers.spaces, c.controllers.availability, mw));
  router.use('/reservations', reservationRoutes(c.controllers.reservations, mw));
  router.use('/api-keys', apiKeyRoutes(c.controllers.apiKeys, mw));
  // RF-11: solo sistemas externos con API key read:now (pantalla informativa); caché 60 s.
  router.get(
    '/now',
    mw.requireApiKey('read:now'),
    mw.rateLimit,
    mw.cache(() => mw.keys.now()),
    c.controllers.availability.now,
  );
  return router;
}
