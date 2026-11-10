import { Router } from 'express';
import {
  availabilityQuerySchema,
  createSpaceSchema,
  idParamSchema,
  spaceQuerySchema,
  updateSpaceSchema,
} from '@reservalab/shared';
import type { AvailabilityController } from '../controllers/availability.controller';
import type { SpaceController } from '../controllers/space.controller';
import { requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import type { RouteMiddleware } from './index';

export function spaceRoutes(
  controller: SpaceController,
  availability: AvailabilityController,
  mw: RouteMiddleware,
): Router {
  const router = Router();
  const adminOnly = [mw.requireAuth, requireRole('ADMIN')];

  // RF-05: JWT o API key con read:spaces; respuesta en caché 60 s.
  router.get(
    '/',
    mw.requireUserOrApiKey('read:spaces'),
    mw.rateLimit,
    validate({ query: spaceQuerySchema }),
    mw.cache((req) => mw.keys.spacesList(JSON.stringify(req.query))),
    controller.list,
  );
  router.get(
    '/:id',
    mw.requireUserOrApiKey('read:spaces'),
    mw.rateLimit,
    validate({ params: idParamSchema }),
    controller.getById,
  );

  // RF-07: bloques libres/ocupados de una fecha; JWT o API key con read:availability; caché 60 s.
  router.get(
    '/:id/availability',
    mw.requireUserOrApiKey('read:availability'),
    mw.rateLimit,
    validate({ params: idParamSchema, query: availabilityQuerySchema }),
    mw.cache((req) => mw.keys.availability(String(req.params.id), String(req.query.date))),
    availability.forSpace,
  );

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
