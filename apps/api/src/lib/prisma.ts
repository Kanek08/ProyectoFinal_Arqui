import { PrismaClient } from '@prisma/client';
import { env } from './env';

/** Única instancia de Prisma de la aplicación. Solo la usan los repositorios. */
export function createPrismaClient(url: string = env.DATABASE_URL): PrismaClient {
  return new PrismaClient({ datasourceUrl: url });
}

export const prisma = createPrismaClient();
