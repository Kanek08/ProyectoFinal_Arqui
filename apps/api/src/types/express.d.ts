import type { Role } from '@reservalab/shared';

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado por requireAuth (JWT). */
      user?: { id: string; role: Role };
      /** Sistema externo autenticado por requireApiKey (X-API-Key). */
      apiKey?: { id: string; name: string; permissions: string[] };
    }
  }
}

export {};
