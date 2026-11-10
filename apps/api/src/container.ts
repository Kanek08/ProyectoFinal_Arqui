import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ApiKeyController } from './controllers/apiKey.controller';
import { AuthController } from './controllers/auth.controller';
import { AvailabilityController } from './controllers/availability.controller';
import { HealthController } from './controllers/health.controller';
import { ReservationController } from './controllers/reservation.controller';
import { SpaceController } from './controllers/space.controller';
import { cacheKeys, createCacheInvalidator, createRedisCacheStore } from './lib/cache';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { argon2Hasher } from './lib/password';
import type { PasswordHasher } from './lib/password';
import { createTokenService } from './lib/tokens';
import { createRequireApiKey, createRequireUserOrApiKey } from './middleware/apiKey';
import { createRequireAuth } from './middleware/auth';
import { createCacheMiddleware } from './middleware/cache';
import { createRateLimit } from './middleware/rateLimit';
import { createApiKeyRepository } from './repositories/apiKey.repository';
import { createHealthRepository } from './repositories/health.repository';
import { createRefreshTokenRepository } from './repositories/refreshToken.repository';
import { createReservationRepository } from './repositories/reservation.repository';
import { createSpaceRepository } from './repositories/space.repository';
import { createUserRepository } from './repositories/user.repository';
import type { RouteMiddleware } from './routes';
import { ApiKeyService } from './services/apiKey.service';
import { AuthService } from './services/auth.service';
import { AvailabilityService } from './services/availability.service';
import { HealthService } from './services/health.service';
import { createHttpNotificationService } from './services/notification.service';
import type { NotificationService } from './services/notification.service';
import { ReservationService } from './services/reservation.service';
import { SpaceService } from './services/space.service';

export interface ContainerDeps {
  prisma: PrismaClient;
  redis: Redis;
  hasher?: PasswordHasher;
  notifications?: NotificationService;
  /** Valores que las pruebas pueden ajustar (por defecto salen de .env). */
  config?: Partial<{ cacheTtlSeconds: number; rateLimitPerMinute: number; redisKeyPrefix: string }>;
}

/**
 * Raíz de composición (inyección de dependencias manual): aquí se conectan
 * repositorios -> servicios -> controladores y se construyen los middlewares.
 * Es el único lugar que conoce todas las capas a la vez.
 */
export function buildContainer(deps: ContainerDeps) {
  const config = {
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    rateLimitPerMinute: env.API_KEY_RATE_LIMIT_PER_MIN,
    redisKeyPrefix: 'rl:',
    ...deps.config,
  };

  const tokens = createTokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
  });

  const cacheStore = createRedisCacheStore(deps.redis);
  const keys = cacheKeys(config.redisKeyPrefix);
  const invalidator = createCacheInvalidator(cacheStore, keys);

  const repositories = {
    users: createUserRepository(deps.prisma),
    refreshTokens: createRefreshTokenRepository(deps.prisma),
    spaces: createSpaceRepository(deps.prisma),
    reservations: createReservationRepository(deps.prisma),
    apiKeys: createApiKeyRepository(deps.prisma),
    health: createHealthRepository(deps.prisma, deps.redis),
  };

  const notifications =
    deps.notifications ?? createHttpNotificationService({ baseUrl: env.NOTIFICATIONS_URL, logger });

  const services = {
    auth: new AuthService({
      users: repositories.users,
      refreshTokens: repositories.refreshTokens,
      tokens,
      hasher: deps.hasher ?? argon2Hasher,
    }),
    spaces: new SpaceService(repositories.spaces, invalidator),
    reservations: new ReservationService({
      reservations: repositories.reservations,
      spaces: repositories.spaces,
      notifications,
      cache: invalidator,
    }),
    availability: new AvailabilityService({
      spaces: repositories.spaces,
      reservations: repositories.reservations,
    }),
    apiKeys: new ApiKeyService({ apiKeys: repositories.apiKeys }),
    health: new HealthService(repositories.health),
  };

  const requireAuth = createRequireAuth(tokens);
  const requireApiKey = createRequireApiKey(services.apiKeys);
  const middleware: RouteMiddleware = {
    requireAuth,
    requireApiKey,
    requireUserOrApiKey: createRequireUserOrApiKey(requireAuth, requireApiKey),
    rateLimit: createRateLimit(cacheStore, keys, config.rateLimitPerMinute),
    cache: createCacheMiddleware(cacheStore, config.cacheTtlSeconds),
    keys,
  };

  return {
    tokens,
    services,
    cacheStore,
    controllers: {
      auth: new AuthController(services.auth),
      spaces: new SpaceController(services.spaces),
      availability: new AvailabilityController(services.availability),
      reservations: new ReservationController(services.reservations),
      apiKeys: new ApiKeyController(services.apiKeys),
      health: new HealthController(services.health),
    },
    middleware,
  };
}

export type Container = ReturnType<typeof buildContainer>;
