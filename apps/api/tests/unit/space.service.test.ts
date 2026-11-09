import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceRepository } from '../../src/repositories/space.repository';
import type { SpaceRecord } from '../../src/repositories/types';
import { SpaceService } from '../../src/services/space.service';

const space: SpaceRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Lab 1',
  building: 'A',
  capacity: 30,
  openTime: '07:00',
  closeTime: '21:00',
  active: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('SpaceService (repositorio simulado)', () => {
  let repo: { [K in keyof SpaceRepository]: ReturnType<typeof vi.fn> };
  let service: SpaceService;

  beforeEach(() => {
    repo = {
      list: vi.fn(),
      findById: vi.fn(),
      findByBuildingAndName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    service = new SpaceService(repo as unknown as SpaceRepository);
  });

  it('rechaza un nombre repetido en el mismo edificio con 409', async () => {
    repo.findByBuildingAndName.mockResolvedValue(space);
    await expect(
      service.create({ name: 'Lab 1', building: 'A', capacity: 10, openTime: '07:00', closeTime: '09:00' }),
    ).rejects.toMatchObject({ status: 409, code: 'SPACE_NAME_TAKEN' });
  });

  it('valida el horario combinando el valor actual con el parcial', async () => {
    repo.findById.mockResolvedValue(space);
    await expect(service.update(space.id, { openTime: '22:00' })).rejects.toMatchObject({ status: 422 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('el borrado es lógico (active=false)', async () => {
    repo.findById.mockResolvedValue(space);
    await service.remove(space.id);
    expect(repo.update).toHaveBeenCalledWith(space.id, { active: false });
  });

  it('no permite borrar un espacio ya inactivo', async () => {
    repo.findById.mockResolvedValue({ ...space, active: false });
    await expect(service.remove(space.id)).rejects.toMatchObject({ status: 404 });
  });
});
