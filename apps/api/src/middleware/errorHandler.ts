import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@reservalab/shared';
import { AppError, NotFoundError } from '../errors';
import { logger } from '../lib/logger';

/** Rutas inexistentes: 404 con el mismo formato de error. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No existe la ruta ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
};

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

/** Punto único donde los errores se convierten en { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiError = { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } };

  if (err instanceof AppError) {
    status = err.status;
    body = {
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
  } else if (isBodyParserError(err) && err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es JSON válido' } };
  } else if (isBodyParserError(err) && err.type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud es demasiado grande' } };
  }

  if (status >= 500) logger.error({ err, path: req.path }, 'Error no controlado');
  res.status(status).json(body);
};
