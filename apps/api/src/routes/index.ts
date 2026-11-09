import { Router } from 'express';
import type { Container } from '../container';
import { authRoutes } from './auth.routes';
import { spaceRoutes } from './space.routes';

/** Router raíz montado en /api/v1. */
export function apiRoutes(c: Container): Router {
  const router = Router();
  router.get('/health', c.controllers.health.check); // RF-13
  router.use('/auth', authRoutes(c.controllers.auth, c.middleware.requireAuth));
  router.use('/spaces', spaceRoutes(c.controllers.spaces, c.middleware.requireAuth));
  return router;
}
