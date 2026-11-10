import type { ApiKey, ApiKeyPermission, CreateApiKeyInput, CreatedApiKey } from '@reservalab/shared';
import { apiKeyPermissionSchema } from '@reservalab/shared';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../errors';
import { generateApiKey, isApiKeyFormat, sha256 } from '../lib/crypto';
import type { ApiKeyRepository } from '../repositories/apiKey.repository';
import type { ApiKeyRecord } from '../repositories/types';

export function toApiKeyDto(record: ApiKeyRecord): ApiKey {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    // Solo se exponen permisos conocidos, aunque en la base hubiera texto extra.
    permissions: record.permissions.filter(
      (p): p is ApiKeyPermission => apiKeyPermissionSchema.safeParse(p).success,
    ),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Identidad de un sistema externo autenticado con API key. */
export interface ApiKeyIdentity {
  id: string;
  name: string;
  permissions: string[];
}

/**
 * Reglas de API keys:
 * - Se genera rl_live_ + 32 caracteres aleatorios; la key completa se devuelve una sola vez.
 * - En la base solo se guardan nombre, prefijo visible, hash SHA-256 y permisos.
 * - Autenticar: 401 si no existe o está revocada, 403 si le falta el permiso; actualiza lastUsedAt.
 */
export class ApiKeyService {
  private readonly now: () => Date;

  constructor(private readonly deps: { apiKeys: ApiKeyRepository; now?: () => Date }) {
    this.now = deps.now ?? (() => new Date());
  }

  async create(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const generated = generateApiKey();
    const record = await this.deps.apiKeys.create({
      name: input.name,
      prefix: generated.prefix,
      keyHash: generated.hash,
      permissions: input.permissions,
    });
    return { ...toApiKeyDto(record), key: generated.key };
  }

  async list(): Promise<ApiKey[]> {
    const rows = await this.deps.apiKeys.list();
    return rows.map(toApiKeyDto);
  }

  async revoke(id: string): Promise<void> {
    const record = await this.deps.apiKeys.findById(id);
    if (!record) throw new NotFoundError('La API key no existe', 'API_KEY_NOT_FOUND');
    await this.deps.apiKeys.revoke(id);
  }

  async authenticate(rawKey: string | undefined, permission: ApiKeyPermission): Promise<ApiKeyIdentity> {
    if (!rawKey)
      throw new UnauthorizedError('Falta la API key en el encabezado X-API-Key', 'MISSING_API_KEY');

    const record = isApiKeyFormat(rawKey) ? await this.deps.apiKeys.findByHash(sha256(rawKey)) : null;
    if (!record) throw new UnauthorizedError('API key inválida', 'INVALID_API_KEY');
    if (record.revokedAt) throw new UnauthorizedError('La API key fue revocada', 'API_KEY_REVOKED');

    if (!record.permissions.includes(permission)) {
      throw new ForbiddenError(`La API key no tiene el permiso ${permission}`, 'MISSING_PERMISSION');
    }

    await this.deps.apiKeys.touchLastUsed(record.id, this.now());
    return { id: record.id, name: record.name, permissions: record.permissions };
  }
}
