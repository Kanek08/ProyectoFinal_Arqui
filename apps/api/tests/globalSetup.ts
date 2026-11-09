import { execSync } from 'node:child_process';

/** Aplica las migraciones a la base de pruebas antes de correr la suite. */
export default function setup() {
  const url =
    process.env.DATABASE_URL_TEST ?? 'postgresql://reservalab:reservalab@localhost:5432/reservalab_test';
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
