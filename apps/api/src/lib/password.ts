import argon2 from 'argon2';

/** Abstracción del algoritmo de contraseñas para poder simularlo en pruebas unitarias. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export const argon2Hasher: PasswordHasher = {
  hash: (plain) => argon2.hash(plain, { type: argon2.argon2id }),
  verify: async (hash, plain) => {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  },
};
