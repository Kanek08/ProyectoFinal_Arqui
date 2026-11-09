import { createHash, randomBytes } from 'node:crypto';

/** Hash SHA-256 en hexadecimal. Se usa para refresh tokens y API keys (valores de alta entropía). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const API_KEY_PREFIX = 'rl_live_';

/**
 * Genera una API key con prefijo visible + parte aleatoria (32 bytes).
 * Devuelve la key completa (se muestra una sola vez), el prefijo para
 * identificarla en listados y el hash que se guarda en la base de datos.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
}
