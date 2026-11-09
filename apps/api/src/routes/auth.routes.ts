import { Router } from 'express';
import type { RequestHandler } from 'express';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from '@reservalab/shared';
import type { AuthController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';

export function authRoutes(controller: AuthController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.post('/register', validate({ body: registerSchema }), controller.register); // RF-01
  router.post('/login', validate({ body: loginSchema }), controller.login); // RF-02
  router.post('/refresh', validate({ body: refreshSchema }), controller.refresh); // RF-03
  router.post('/logout', requireAuth, validate({ body: logoutSchema }), controller.logout); // RF-04
  return router;
}
