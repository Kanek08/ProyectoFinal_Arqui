import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Carga el .env de la raíz si existe (para respetar puertos personalizados como POSTGRES_PORT).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // Sin .env se usan los valores por defecto de abajo.
}

// Las pruebas nunca tocan la base de desarrollo: usan DATABASE_URL_TEST (reservalab_test).
const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ?? 'postgresql://reservalab:reservalab@localhost:5432/reservalab_test';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_TEST: testDatabaseUrl,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
      NOTIFICATIONS_URL: process.env.NOTIFICATIONS_URL ?? 'http://localhost:3001',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
      // La rúbrica pide 70 % o más: test:coverage falla si se baja de ahí.
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
