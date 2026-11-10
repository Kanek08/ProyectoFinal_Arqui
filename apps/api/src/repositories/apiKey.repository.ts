import type { PrismaClient } from '@prisma/client';
import type { ApiKeyRecord } from './types';

export interface ApiKeyRepository {
  create(data: {
    name: string;
    prefix: string;
    keyHash: string;
    permissions: string[];
  }): Promise<ApiKeyRecord>;
  list(): Promise<ApiKeyRecord[]>;
  findById(id: string): Promise<ApiKeyRecord | null>;
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  revoke(id: string): Promise<void>;
  touchLastUsed(id: string, at: Date): Promise<void>;
}

export function createApiKeyRepository(prisma: PrismaClient): ApiKeyRepository {
  return {
    create: (data) => prisma.apiKey.create({ data }),
    list: () => prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } }),
    findById: (id) => prisma.apiKey.findUnique({ where: { id } }),
    findByHash: (keyHash) => prisma.apiKey.findUnique({ where: { keyHash } }),
    async revoke(id) {
      await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    },
    async touchLastUsed(id, at) {
      await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: at } });
    },
  };
}
