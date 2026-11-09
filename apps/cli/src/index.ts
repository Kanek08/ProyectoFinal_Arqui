#!/usr/bin/env node
import { Command } from 'commander';
import type { Health } from '@reservalab/shared';

/**
 * CLI de administrador. En la fase 1 solo verifica la conexión; los comandos
 * para crear espacios y emitir API keys se agregan en la fase 3.
 */
const program = new Command()
  .name('reservalab')
  .description('Herramienta de administrador de ReservaLab')
  .option(
    '--api <url>',
    'URL base de la API',
    process.env.RESERVALAB_API_URL ?? 'http://localhost:3000/api/v1',
  );

program
  .command('health')
  .description('Muestra el estado de la API, la base de datos y la caché')
  .action(async () => {
    const { api } = program.opts<{ api: string }>();
    const res = await fetch(`${api}/health`);
    const body = (await res.json()) as Health;
    console.log(
      `API: ${body.services.api} | Base de datos: ${body.services.database} | Caché: ${body.services.cache}`,
    );
    process.exitCode = res.ok ? 0 : 1;
  });

program.parseAsync().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
