import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AuthController } from './controllers/auth.controller';
import { HealthController } from './controllers/health.controller';
import { SpaceController } from './controllers/space.controller';
import { env } from './lib/env';
import { argon2Hasher } from './lib/password';
import type { PasswordHasher } from './lib/password';
import { createTokenService } from './lib/tokens';
import { createRequireAuth } from './middleware/auth';
import { createHealthRepository } from './repositories/health.repository';
import { createRefreshTokenRepository } from './repositories/refreshToken.repository';
import { createSpaceRepository } from './repositories/space.repository';
import { createUserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { HealthService } from './services/health.service';
import { SpaceService } from './services/space.service';

/**
 * Raíz de composición (inyección de dependencias manual): aquí se conectan
 * repositorios -> servicios -> controladores. Es el único lugar que conoce
 * todas las capas a la vez.
 */
export function buildContainer(deps: { prisma: PrismaClient; redis: Redis; hasher?: PasswordHasher }) {
  const tokens = createTokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
  });

  const repositories = {
    users: createUserRepository(deps.prisma),
    refreshTokens: createRefreshTokenRepository(deps.prisma),
    spaces: createSpaceRepository(deps.prisma),
    health: createHealthRepository(deps.prisma, deps.redis),
  };

  const services = {
    auth: new AuthService({
      users: repositories.users,
      refreshTokens: repositories.refreshTokens,
      tokens,
      hasher: deps.hasher ?? argon2Hasher,
    }),
    spaces: new SpaceService(repositories.spaces),
    health: new HealthService(repositories.health),
  };

  return {
    tokens,
    services,
    controllers: {
      auth: new AuthController(services.auth),
      spaces: new SpaceController(services.spaces),
      health: new HealthController(services.health),
    },
    middleware: {
      requireAuth: createRequireAuth(tokens),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
