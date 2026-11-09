import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createSpaceSchema, idParamSchema, spaceQuerySchema, updateSpaceSchema } from '@reservalab/shared';
import type { SpaceController } from '../controllers/space.controller';
import { requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

export function spaceRoutes(controller: SpaceController, requireAuth: RequestHandler): Router {
  const router = Router();
  const adminOnly = [requireAuth, requireRole('ADMIN')];

  // RF-05 (en la fase 2 se acepta también API key con permiso read:spaces)
  router.get('/', requireAuth, validate({ query: spaceQuerySchema }), controller.list);
  router.get('/:id', requireAuth, validate({ params: idParamSchema }), controller.getById);

  // RF-06: gestión de espacios, solo administrador
  router.post('/', ...adminOnly, validate({ body: createSpaceSchema }), controller.create);
  router.patch(
    '/:id',
    ...adminOnly,
    validate({ params: idParamSchema, body: updateSpaceSchema }),
    controller.update,
  );
  router.delete('/:id', ...adminOnly, validate({ params: idParamSchema }), controller.remove);
  return router;
}
