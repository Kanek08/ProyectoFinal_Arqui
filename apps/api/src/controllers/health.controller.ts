import type { Request, Response } from 'express';
import type { HealthService } from '../services/health.service';

export class HealthController {
  constructor(private readonly health: HealthService) {}

  check = async (_req: Request, res: Response) => {
    const result = await this.health.check();
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  };
}
