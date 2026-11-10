import { Router } from 'express';
import { createReservationSchema, idParamSchema } from '@reservalab/shared';
import type { ReservationController } from '../controllers/reservation.controller';
import { requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import type { RouteMiddleware } from './index';

export function reservationRoutes(controller: ReservationController, mw: RouteMiddleware): Router {
  const router = Router();
  router.use(mw.requireAuth);

  // RF-08: solo docentes y administradores reservan.
  router.post(
    '/',
    requireRole('DOCENTE', 'ADMIN'),
    validate({ body: createReservationSchema }),
    controller.create,
  );
  // RF-09
  router.get('/me', controller.listMine);
  // RF-10: el servicio verifica que sea el dueño o un administrador.
  router.delete('/:id', validate({ params: idParamSchema }), controller.cancel);
  return router;
}
