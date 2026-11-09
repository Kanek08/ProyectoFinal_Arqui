import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'off',
    },
  },
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Regla de arquitectura: los controladores y las rutas nunca acceden al ORM.
    files: ['apps/api/src/controllers/**/*.ts', 'apps/api/src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@prisma/client', message: 'Solo los repositorios usan Prisma.' }],
          patterns: [
            {
              group: ['**/lib/prisma*', '**/repositories/**'],
              message: 'Los controladores solo hablan con servicios.',
            },
          ],
        },
      ],
    },
  },
  {
    // Regla de arquitectura: los repositorios y servicios no conocen HTTP.
    files: ['apps/api/src/repositories/**/*.ts', 'apps/api/src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'express', message: 'Servicios y repositorios no conocen req/res.' }] },
      ],
    },
  },
  prettier,
);
