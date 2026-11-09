import type { RequestHandler } from 'express';
import type { Role } from '@reservalab/shared';
import { ForbiddenError, UnauthorizedError } from '../errors';
import type { TokenService } from '../lib/tokens';

/** Lee el header Authorization: Bearer <token>. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Exige un access token JWT válido y deja el usuario en req.user. */
export function createRequireAuth(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const token = extractBearer(req.headers.authorization);
    if (!token) return next(new UnauthorizedError('Falta el token de acceso', 'MISSING_TOKEN'));

    const payload = tokens.verifyAccess(token);
    if (!payload) return next(new UnauthorizedError('Token de acceso inválido o vencido', 'INVALID_TOKEN'));

    req.user = { id: payload.sub, role: payload.role };
    next();
  };
}

/** Autorización por rol reutilizable. Debe ir después de requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Esta acción requiere el rol: ${roles.join(' o ')}`, 'INSUFFICIENT_ROLE'),
      );
    }
    next();
  };
}
