import { createHash, randomBytes } from 'node:crypto';

/** Hash SHA-256 en hexadecimal. Se usa para refresh tokens y API keys (valores de alta entropía). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const API_KEY_PREFIX = 'rl_live_';
/** Largo de la parte aleatoria de una API key. */
export const API_KEY_RANDOM_LENGTH = 32;
/** Caracteres visibles que se guardan para identificar la key en listados (rl_live_ + 4). */
const VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 4;

const API_KEY_PATTERN = new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{${API_KEY_RANDOM_LENGTH}}$`);

/** Comprueba el formato rl_live_ + 32 caracteres base64url. */
export function isApiKeyFormat(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}

/** Datos que se guardan de una key: prefijo visible y hash (nunca la key completa). */
export function describeApiKey(key: string): { key: string; prefix: string; hash: string } {
  return { key, prefix: key.slice(0, VISIBLE_PREFIX_LENGTH), hash: sha256(key) };
}

/**
 * Genera una API key: prefijo visible rl_live_ + 32 caracteres aleatorios
 * (24 bytes en base64url). La key completa se muestra una sola vez; en la base
 * solo se guardan el prefijo y el hash SHA-256.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  return describeApiKey(`${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`);
}
