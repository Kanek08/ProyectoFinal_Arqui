/**
 * Errores de dominio. Los servicios lanzan estas clases y el middleware
 * errorHandler las traduce al formato JSON { error: { code, message, details? } }.
 * Así ninguna capa por debajo de los controladores conoce códigos HTTP de Express.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Solicitud inválida', code = 'BAD_REQUEST', details?: unknown) {
    super(400, code, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos', details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Se requiere autenticación', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permiso para realizar esta acción', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'El recurso entra en conflicto con otro existente',
    code = 'CONFLICT',
    details?: unknown,
  ) {
    super(409, code, message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiadas solicitudes, intenta más tarde', details?: unknown) {
    super(429, 'TOO_MANY_REQUESTS', message, details);
  }
}
