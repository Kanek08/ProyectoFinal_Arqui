import type { CreateSpaceInput, Space, SpaceQuery, UpdateSpaceInput } from '@reservalab/shared';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import type { SpaceRepository } from '../repositories/space.repository';
import type { SpaceRecord } from '../repositories/types';

export function toSpaceDto(space: SpaceRecord): Space {
  return {
    ...space,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
  };
}

/** Reglas de negocio de espacios: nombre único por edificio, horario válido y borrado lógico. */
export class SpaceService {
  constructor(private readonly spaces: SpaceRepository) {}

  async list(filters: SpaceQuery): Promise<Space[]> {
    const rows = await this.spaces.list(filters);
    return rows.map(toSpaceDto);
  }

  async getById(id: string): Promise<Space> {
    return toSpaceDto(await this.findActiveOrThrow(id));
  }

  async create(input: CreateSpaceInput): Promise<Space> {
    await this.ensureNameAvailable(input.building, input.name);
    return toSpaceDto(await this.spaces.create(input));
  }

  async update(id: string, input: UpdateSpaceInput): Promise<Space> {
    const current = await this.spaces.findById(id);
    if (!current) throw new NotFoundError('El espacio no existe', 'SPACE_NOT_FOUND');

    const openTime = input.openTime ?? current.openTime;
    const closeTime = input.closeTime ?? current.closeTime;
    if (openTime >= closeTime) {
      throw new ValidationError('openTime debe ser menor que closeTime', [
        { path: ['closeTime'], message: 'openTime debe ser menor que closeTime' },
      ]);
    }

    const building = input.building ?? current.building;
    const name = input.name ?? current.name;
    if (building !== current.building || name !== current.name) {
      await this.ensureNameAvailable(building, name, id);
    }

    return toSpaceDto(await this.spaces.update(id, input));
  }

  /** Borrado lógico: el espacio deja de listarse pero conserva su historial de reservas. */
  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.spaces.update(id, { active: false });
  }

  private async findActiveOrThrow(id: string): Promise<SpaceRecord> {
    const space = await this.spaces.findById(id);
    if (!space || !space.active) throw new NotFoundError('El espacio no existe', 'SPACE_NOT_FOUND');
    return space;
  }

  private async ensureNameAvailable(building: string, name: string, exceptId?: string): Promise<void> {
    const existing = await this.spaces.findByBuildingAndName(building, name);
    if (existing && existing.id !== exceptId) {
      throw new ConflictError(
        `Ya existe un espacio "${name}" en el edificio ${building}`,
        'SPACE_NAME_TAKEN',
      );
    }
  }
}
