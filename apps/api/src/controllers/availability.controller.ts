import type { Request, Response } from 'express';
import type { AvailabilityQuery, IdParam } from '@reservalab/shared';
import type { AvailabilityService } from '../services/availability.service';

export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /** RF-07 */
  forSpace = async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const { date } = req.query as AvailabilityQuery;
    res.json(await this.availability.forSpace(id, date));
  };

  /** RF-11 */
  now = async (_req: Request, res: Response) => {
    res.json(await this.availability.currentOccupancy());
  };
}
