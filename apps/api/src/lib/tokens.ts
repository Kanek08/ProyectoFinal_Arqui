import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@reservalab/shared';
import { roleSchema } from '@reservalab/shared';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export interface TokenConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

/** Firma y verifica JWT. No conoce la base de datos ni HTTP. */
export interface TokenService {
  readonly accessTtlSeconds: number;
  signAccess(payload: AccessTokenPayload): string;
  verifyAccess(token: string): AccessTokenPayload | null;
  signRefresh(userId: string): { token: string; expiresAt: Date };
  verifyRefresh(token: string): { sub: string } | null;
}

export function createTokenService(config: TokenConfig): TokenService {
  return {
    accessTtlSeconds: config.accessTtlSeconds,

    signAccess({ sub, role }) {
      return jwt.sign({ role }, config.accessSecret, {
        subject: sub,
        expiresIn: config.accessTtlSeconds,
        algorithm: 'HS256',
      });
    },

    verifyAccess(token) {
      try {
        const decoded = jwt.verify(token, config.accessSecret, { algorithms: ['HS256'] });
        if (typeof decoded === 'string' || !decoded.sub) return null;
        const role = roleSchema.safeParse(decoded.role);
        return role.success ? { sub: decoded.sub, role: role.data } : null;
      } catch {
        return null;
      }
    },

    signRefresh(userId) {
      const expiresInSeconds = config.refreshTtlDays * 24 * 60 * 60;
      // jti aleatorio: dos refresh emitidos en el mismo segundo nunca colisionan.
      const token = jwt.sign({ typ: 'refresh' }, config.refreshSecret, {
        subject: userId,
        jwtid: randomUUID(),
        expiresIn: expiresInSeconds,
        algorithm: 'HS256',
      });
      return { token, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    },

    verifyRefresh(token) {
      try {
        const decoded = jwt.verify(token, config.refreshSecret, { algorithms: ['HS256'] });
        if (typeof decoded === 'string' || !decoded.sub || decoded.typ !== 'refresh') return null;
        return { sub: decoded.sub };
      } catch {
        return null;
      }
    },
  };
}
