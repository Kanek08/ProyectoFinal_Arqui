import type { Health } from '@reservalab/shared';
import type { HealthRepository } from '../repositories/health.repository';

export class HealthService {
  constructor(private readonly health: HealthRepository) {}

  async check(): Promise<Health> {
    const [database, cache] = await Promise.all([this.health.pingDatabase(), this.health.pingCache()]);
    return {
      status: database && cache ? 'ok' : 'degraded',
      services: { api: 'up', database: database ? 'up' : 'down', cache: cache ? 'up' : 'down' },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
