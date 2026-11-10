import { Router } from 'express';
import { createApiKeySchema, idParamSchema } from '@reservalab/shared';
import type { ApiKeyController } from '../controllers/apiKey.controller';
import { requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import type { RouteMiddleware } from './index';

/** RF-12: emisión, listado y revocación de API keys (solo administrador). */
export function apiKeyRoutes(controller: ApiKeyController, mw: RouteMiddleware): Router {
  const router = Router();
  router.use(mw.requireAuth, requireRole('ADMIN'));
  router.post('/', validate({ body: createApiKeySchema }), controller.create);
  router.get('/', controller.list);
  router.delete('/:id', validate({ params: idParamSchema }), controller.revoke);
  return router;
}
