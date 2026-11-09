import type { PrismaClient } from '@prisma/client';
import type { RefreshTokenRecord } from './types';

export interface RefreshTokenRepository {
  create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  /** Revoca el token anterior y crea el nuevo en una sola transacción (rotación). */
  rotate(
    oldId: string,
    next: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<RefreshTokenRecord>;
}

export function createRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    create: (data) => prisma.refreshToken.create({ data }),

    findByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash } }),

    async revoke(id) {
      await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    async revokeAllForUser(userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    async rotate(oldId, next) {
      const [, created] = await prisma.$transaction([
        prisma.refreshToken.update({ where: { id: oldId }, data: { revokedAt: new Date() } }),
        prisma.refreshToken.create({ data: next }),
      ]);
      return created;
    },
  };
}
