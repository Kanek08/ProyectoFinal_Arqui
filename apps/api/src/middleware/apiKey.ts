import type { RequestHandler } from 'express';
import type { ApiKeyPermission } from '@reservalab/shared';
import type { ApiKeyService } from '../services/apiKey.service';

/**
 * Autenticación de sistemas externos con el encabezado X-API-Key.
 * 401 si la key no existe o está revocada, 403 si no tiene el permiso pedido.
 */
export function createRequireApiKey(apiKeys: ApiKeyService) {
  return (permission: ApiKeyPermission): RequestHandler =>
    async (req, _res, next) => {
      try {
        req.apiKey = await apiKeys.authenticate(req.get('x-api-key'), permission);
        next();
      } catch (err) {
        next(err);
      }
    };
}

/**
 * Acepta un usuario con JWT (cualquier rol) o un sistema con API key y el permiso pedido.
 * Si llega el encabezado Authorization se usa JWT; si no, se exige X-API-Key.
 */
export function createRequireUserOrApiKey(
  requireAuth: RequestHandler,
  requireApiKey: (permission: ApiKeyPermission) => RequestHandler,
) {
  return (permission: ApiKeyPermission): RequestHandler => {
    const apiKeyCheck = requireApiKey(permission);
    return (req, res, next) => {
      if (req.headers.authorization || !req.get('x-api-key')) return requireAuth(req, res, next);
      return apiKeyCheck(req, res, next);
    };
  };
}
