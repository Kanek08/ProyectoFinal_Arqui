import type { PrismaClient } from '@prisma/client';
import type { CreateSpaceInput, SpaceQuery, UpdateSpaceInput } from '@reservalab/shared';
import type { SpaceRecord } from './types';

export interface SpaceRepository {
  list(filters: SpaceQuery & { includeInactive?: boolean }): Promise<SpaceRecord[]>;
  findById(id: string): Promise<SpaceRecord | null>;
  findByBuildingAndName(building: string, name: string): Promise<SpaceRecord | null>;
  create(data: CreateSpaceInput): Promise<SpaceRecord>;
  update(id: string, data: UpdateSpaceInput): Promise<SpaceRecord>;
}

export function createSpaceRepository(prisma: PrismaClient): SpaceRepository {
  return {
    list: ({ building, minCapacity, includeInactive }) =>
      prisma.space.findMany({
        where: {
          ...(includeInactive ? {} : { active: true }),
          ...(building ? { building: { equals: building, mode: 'insensitive' } } : {}),
          ...(minCapacity ? { capacity: { gte: minCapacity } } : {}),
        },
        orderBy: [{ building: 'asc' }, { name: 'asc' }],
      }),

    findById: (id) => prisma.space.findUnique({ where: { id } }),

    findByBuildingAndName: (building, name) =>
      prisma.space.findUnique({ where: { building_name: { building, name } } }),

    create: (data) => prisma.space.create({ data }),

    update: (id, data) => prisma.space.update({ where: { id }, data }),
  };
}
