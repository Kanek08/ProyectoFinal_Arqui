import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, UnauthorizedError } from '../../src/errors';
import { sha256 } from '../../src/lib/crypto';
import { createTokenService } from '../../src/lib/tokens';
import type { RefreshTokenRepository } from '../../src/repositories/refreshToken.repository';
import type { RefreshTokenRecord, UserRecord } from '../../src/repositories/types';
import type { UserRepository } from '../../src/repositories/user.repository';
import { AuthService } from '../../src/services/auth.service';

const tokens = createTokenService({
  accessSecret: 'unit-access-secret-0123456789-0123456789',
  refreshSecret: 'unit-refresh-secret-0123456789-0123456789',
  accessTtlSeconds: 900,
  refreshTtlDays: 7,
});

const user: UserRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Docente',
  email: 'docente@test.edu',
  passwordHash: 'hash-correcto',
  role: 'DOCENTE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function storedToken(token: string, overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    id: 'rt-1',
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService (repositorios simulados)', () => {
  let users: { [K in keyof UserRepository]: ReturnType<typeof vi.fn> };
  let refreshTokens: { [K in keyof RefreshTokenRepository]: ReturnType<typeof vi.fn> };
  let hasher: { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmail: vi.fn(), findById: vi.fn(), create: vi.fn() };
    refreshTokens = {
      create: vi.fn(),
      findByHash: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
      rotate: vi.fn(),
    };
    hasher = { hash: vi.fn().mockResolvedValue('nuevo-hash'), verify: vi.fn() };
    service = new AuthService({
      users: users as unknown as UserRepository,
      refreshTokens: refreshTokens as unknown as RefreshTokenRepository,
      tokens,
      hasher,
    });
  });

  describe('register', () => {
    it('crea al usuario siempre con rol ESTUDIANTE y la contraseña hasheada', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation(async (data) => ({ ...user, ...data, id: user.id }));

      const result = await service.register({ name: 'Ana', email: 'ana@test.edu', password: 'Password123!' });

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@test.edu', passwordHash: 'nuevo-hash', role: 'ESTUDIANTE' }),
      );
      expect(result.role).toBe('ESTUDIANTE');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rechaza un correo duplicado con 409', async () => {
      users.findByEmail.mockResolvedValue(user);

      const promise = service.register({ name: 'Otro', email: user.email, password: 'Password123!' });

      await expect(promise).rejects.toBeInstanceOf(ConflictError);
      await expect(promise).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rechaza una contraseña incorrecta con 401 sin emitir tokens', async () => {
      users.findByEmail.mockResolvedValue(user);
      hasher.verify.mockResolvedValue(false);

      await expect(service.login({ email: user.email, password: 'mala' })).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
      });
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('rechaza un correo inexistente con el mismo error que una contraseña incorrecta', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'nadie@test.edu', password: 'x' })).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      expect(hasher.verify).not.toHaveBeenCalled();
    });

    it('devuelve access token con sub y role, y guarda solo el hash del refresh token', async () => {
      users.findByEmail.mockResolvedValue(user);
      hasher.verify.mockResolvedValue(true);

      const result = await service.login({ email: user.email, password: 'Password123!' });

      expect(tokens.verifyAccess(result.accessToken)).toEqual({ sub: user.id, role: 'DOCENTE' });
      expect(result.expiresIn).toBe(900);
      const saved = refreshTokens.create.mock.calls[0]![0];
      expect(saved.tokenHash).toBe(sha256(result.refreshToken));
      expect(saved.tokenHash).not.toBe(result.refreshToken);
    });
  });

  describe('refresh', () => {
    it('rota el token: revoca el anterior y emite uno nuevo', async () => {
      const { token } = tokens.signRefresh(user.id);
      refreshTokens.findByHash.mockResolvedValue(storedToken(token));
      users.findById.mockResolvedValue(user);

      const result = await service.refresh(token);

      expect(result.refreshToken).not.toBe(token);
      expect(refreshTokens.rotate).toHaveBeenCalledWith(
        'rt-1',
        expect.objectContaining({ userId: user.id, tokenHash: sha256(result.refreshToken) }),
      );
    });

    it('rechaza un refresh token revocado y revoca todos los del usuario (posible robo)', async () => {
      const { token } = tokens.signRefresh(user.id);
      refreshTokens.findByHash.mockResolvedValue(storedToken(token, { revokedAt: new Date() }));

      await expect(service.refresh(token)).rejects.toMatchObject({
        status: 401,
        code: 'REFRESH_TOKEN_REVOKED',
      });
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(user.id);
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
    });

    it('rechaza un refresh token vencido según la base de datos', async () => {
      const { token } = tokens.signRefresh(user.id);
      refreshTokens.findByHash.mockResolvedValue(
        storedToken(token, { expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh(token)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
    });

    it('rechaza un refresh token con firma JWT vencida sin consultar la base', async () => {
      const expired = createTokenService({
        accessSecret: 'unit-access-secret-0123456789-0123456789',
        refreshSecret: 'unit-refresh-secret-0123456789-0123456789',
        accessTtlSeconds: 900,
        refreshTtlDays: -1,
      }).signRefresh(user.id).token;

      await expect(service.refresh(expired)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(refreshTokens.findByHash).not.toHaveBeenCalled();
    });

    it('rechaza un token que no existe en la base', async () => {
      const { token } = tokens.signRefresh(user.id);
      refreshTokens.findByHash.mockResolvedValue(null);

      await expect(service.refresh(token)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    });
  });

  describe('logout', () => {
    it('revoca el refresh token del propio usuario', async () => {
      const { token } = tokens.signRefresh(user.id);
      refreshTokens.findByHash.mockResolvedValue(storedToken(token));

      await service.logout(user.id, token);

      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1');
    });

    it('no revoca tokens de otro usuario', async () => {
      const { token } = tokens.signRefresh(user.id);
      refreshTokens.findByHash.mockResolvedValue(storedToken(token));

      await service.logout('otro-usuario', token);

      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });
  });
});
