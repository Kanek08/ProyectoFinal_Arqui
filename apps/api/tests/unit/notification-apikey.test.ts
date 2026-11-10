import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isApiKeyFormat, sha256 } from '../../src/lib/crypto';
import type { ApiKeyRepository } from '../../src/repositories/apiKey.repository';
import type { ApiKeyRecord } from '../../src/repositories/types';
import { ApiKeyService } from '../../src/services/apiKey.service';
import { createHttpNotificationService } from '../../src/services/notification.service';
import type { ReservationNotification } from '../../src/services/notification.service';

const notification = { event: 'reservation.confirmed', reservationId: 'r1' } as ReservationNotification;

describe('NotificationService (fetch simulado)', () => {
  const logger = { info: vi.fn(), error: vi.fn() };
  beforeEach(() => {
    logger.info.mockReset();
    logger.error.mockReset();
  });

  it('hace POST a NOTIFICATIONS_URL/notifications con el evento en JSON y timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const service = createHttpNotificationService({ baseUrl: 'http://mock:3001/', fetchImpl, logger });
    await expect(service.notify(notification)).resolves.toBe(true);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://mock:3001/notifications');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(notification);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('si el servicio falla o tarda, registra el error y no lanza', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const service = createHttpNotificationService({ baseUrl: 'http://mock', fetchImpl, logger });
    await expect(service.notify(notification)).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('si responde con error HTTP, lo registra y no lanza', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    const service = createHttpNotificationService({ baseUrl: 'http://mock', fetchImpl, logger });
    await expect(service.notify(notification)).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }), expect.any(String));
  });

  it('aborta de verdad a los 3 s (timeout real con temporizador corto)', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const service = createHttpNotificationService({
      baseUrl: 'http://mock',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
      timeoutMs: 20,
    });
    await expect(service.notify(notification)).resolves.toBe(false);
  });
});

describe('ApiKeyService (repositorio simulado)', () => {
  const record: ApiKeyRecord = {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Pantalla',
    prefix: 'rl_live_abcd',
    keyHash: 'x',
    permissions: ['read:now'],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
  };
  let repo: { [K in keyof ApiKeyRepository]: ReturnType<typeof vi.fn> };
  let service: ApiKeyService;
  const NOW = new Date('2026-11-10T12:00:00Z');

  beforeEach(() => {
    repo = {
      create: vi.fn(async (data) => ({ ...record, ...data })),
      list: vi.fn(),
      findById: vi.fn(),
      findByHash: vi.fn(),
      revoke: vi.fn(),
      touchLastUsed: vi.fn(),
    };
    service = new ApiKeyService({ apiKeys: repo as unknown as ApiKeyRepository, now: () => NOW });
  });

  it('genera rl_live_ + 32 caracteres y guarda solo prefijo y hash', async () => {
    const created = await service.create({ name: 'Pantalla', permissions: ['read:now'] });
    expect(isApiKeyFormat(created.key)).toBe(true);
    const saved = repo.create.mock.calls[0]![0];
    expect(saved.keyHash).toBe(sha256(created.key));
    expect(saved).not.toHaveProperty('key');
    expect(created.key.startsWith(saved.prefix)).toBe(true);
  });

  it('autentica, comprueba el permiso y actualiza lastUsedAt', async () => {
    const key = `rl_live_${'a'.repeat(32)}`;
    repo.findByHash.mockResolvedValue(record);
    await expect(service.authenticate(key, 'read:now')).resolves.toMatchObject({ id: record.id });
    expect(repo.findByHash).toHaveBeenCalledWith(sha256(key));
    expect(repo.touchLastUsed).toHaveBeenCalledWith(record.id, NOW);

    await expect(service.authenticate(key, 'read:spaces')).rejects.toMatchObject({ status: 403 });
  });

  it('401 sin key, con formato inválido, inexistente o revocada', async () => {
    await expect(service.authenticate(undefined, 'read:now')).rejects.toMatchObject({ status: 401 });
    await expect(service.authenticate('otra-cosa', 'read:now')).rejects.toMatchObject({ status: 401 });
    expect(repo.findByHash).not.toHaveBeenCalled();

    const key = `rl_live_${'b'.repeat(32)}`;
    repo.findByHash.mockResolvedValue(null);
    await expect(service.authenticate(key, 'read:now')).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
    repo.findByHash.mockResolvedValue({ ...record, revokedAt: NOW });
    await expect(service.authenticate(key, 'read:now')).rejects.toMatchObject({ code: 'API_KEY_REVOKED' });
    expect(repo.touchLastUsed).not.toHaveBeenCalled();
  });

  it('lista sin exponer el hash y revoca solo si existe', async () => {
    repo.list.mockResolvedValue([record]);
    const [listed] = await service.list();
    expect(listed).not.toHaveProperty('keyHash');

    repo.findById.mockResolvedValue(null);
    await expect(service.revoke('nope')).rejects.toMatchObject({ status: 404 });
    repo.findById.mockResolvedValue(record);
    await service.revoke(record.id);
    expect(repo.revoke).toHaveBeenCalledWith(record.id);
  });
});
