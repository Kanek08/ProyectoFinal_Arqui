import type { Role } from '@reservalab/shared';

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado por requireAuth (JWT). */
      user?: { id: string; role: Role };
    }
  }
}

export {};
