import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import type { Container } from './container';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRoutes } from './routes';

export const API_PREFIX = '/api/v1';

/** Crea la aplicación Express sin abrir puertos (así supertest la usa directamente). */
export function createApp(container: Container) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      exposedHeaders: ['X-Cache', 'Location', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false } }));

  app.get('/', (_req, res) => res.json({ name: 'ReservaLab API', version: '1.0.0', basePath: API_PREFIX }));
  app.use(API_PREFIX, apiRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
