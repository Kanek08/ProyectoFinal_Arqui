import type { LoginInput, LoginResponse, AuthTokens, PublicUser, RegisterInput } from '@reservalab/shared';
import { ConflictError, UnauthorizedError } from '../errors';
import { sha256 } from '../lib/crypto';
import type { PasswordHasher } from '../lib/password';
import type { TokenService } from '../lib/tokens';
import type { RefreshTokenRepository } from '../repositories/refreshToken.repository';
import type { UserRecord } from '../repositories/types';
import type { UserRepository } from '../repositories/user.repository';

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface AuthServiceDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  tokens: TokenService;
  hasher: PasswordHasher;
  now?: () => Date;
}

/**
 * Reglas de negocio de autenticación:
 * - Registro siempre con rol ESTUDIANTE (los roles superiores los asigna un administrador).
 * - El refresh token se guarda solo como hash SHA-256 y se rota en cada uso.
 * - Si se presenta un refresh token ya revocado, se asume robo y se revocan todos los del usuario.
 */
export class AuthService {
  private readonly now: () => Date;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async register(input: RegisterInput): Promise<PublicUser> {
    const existing = await this.deps.users.findByEmail(input.email);
    if (existing) throw new ConflictError('Ya existe un usuario con ese correo', 'EMAIL_TAKEN');

    const passwordHash = await this.deps.hasher.hash(input.password);
    const user = await this.deps.users.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'ESTUDIANTE',
    });
    return toPublicUser(user);
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await this.deps.users.findByEmail(input.email);
    // Mismo mensaje para correo inexistente y contraseña incorrecta: no revela qué correos existen.
    const valid = user ? await this.deps.hasher.verify(user.passwordHash, input.password) : false;
    if (!user || !valid)
      throw new UnauthorizedError('Correo o contraseña incorrectos', 'INVALID_CREDENTIALS');

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = this.deps.tokens.verifyRefresh(refreshToken);
    if (!payload) throw new UnauthorizedError('Refresh token inválido o vencido', 'INVALID_REFRESH_TOKEN');

    const stored = await this.deps.refreshTokens.findByHash(sha256(refreshToken));
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedError('Refresh token inválido o vencido', 'INVALID_REFRESH_TOKEN');
    }
    if (stored.revokedAt) {
      await this.deps.refreshTokens.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Refresh token revocado', 'REFRESH_TOKEN_REVOKED');
    }
    if (stored.expiresAt <= this.now()) {
      throw new UnauthorizedError('Refresh token inválido o vencido', 'INVALID_REFRESH_TOKEN');
    }

    const user = await this.deps.users.findById(stored.userId);
    if (!user) throw new UnauthorizedError('Refresh token inválido o vencido', 'INVALID_REFRESH_TOKEN');

    const next = this.deps.tokens.signRefresh(user.id);
    await this.deps.refreshTokens.rotate(stored.id, {
      userId: user.id,
      tokenHash: sha256(next.token),
      expiresAt: next.expiresAt,
    });

    return {
      accessToken: this.deps.tokens.signAccess({ sub: user.id, role: user.role }),
      refreshToken: next.token,
      tokenType: 'Bearer',
      expiresIn: this.deps.tokens.accessTtlSeconds,
    };
  }

  /** Revoca el refresh token si pertenece al usuario autenticado. Es idempotente. */
  async logout(userId: string, refreshToken: string): Promise<void> {
    const stored = await this.deps.refreshTokens.findByHash(sha256(refreshToken));
    if (stored && stored.userId === userId && !stored.revokedAt) {
      await this.deps.refreshTokens.revoke(stored.id);
    }
  }

  private async issueTokens(user: UserRecord): Promise<AuthTokens> {
    const refresh = this.deps.tokens.signRefresh(user.id);
    await this.deps.refreshTokens.create({
      userId: user.id,
      tokenHash: sha256(refresh.token),
      expiresAt: refresh.expiresAt,
    });
    return {
      accessToken: this.deps.tokens.signAccess({ sub: user.id, role: user.role }),
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.deps.tokens.accessTtlSeconds,
    };
  }
}
