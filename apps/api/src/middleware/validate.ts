import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Valida body, query y params con los esquemas Zod compartidos.
 * Si falla responde 422 con el detalle de cada campo; si pasa, reemplaza los
 * valores por la versión ya parseada (tipos convertidos, espacios recortados).
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const details: { location: string; path: (string | number)[]; message: string }[] = [];

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({ location, path: issue.path, message: issue.message });
        }
        continue;
      }
      // En Express 5 req.query es un getter: se redefine la propiedad en lugar de asignarla.
      Object.defineProperty(req, location, { value: result.data, writable: true, configurable: true });
    }

    if (details.length > 0) return next(new ValidationError('Los datos enviados no son válidos', details));
    next();
  };
}
