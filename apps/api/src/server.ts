import { createApp } from './app';
import { buildContainer } from './container';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

async function main() {
  await prisma.$connect();
  await redis.connect().catch((err: Error) => logger.warn({ err: err.message }, 'Arrancando sin Redis'));

  const app = createApp(buildContainer({ prisma, redis }));
  const server = app.listen(env.PORT, () =>
    logger.info(`ReservaLab API escuchando en http://localhost:${env.PORT}/api/v1`),
  );

  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido, cerrando...`);
    server.close();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar la API');
  process.exit(1);
});
