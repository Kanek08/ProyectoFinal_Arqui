import type { Request, Response } from 'express';
import type { CreateReservationInput, IdParam } from '@reservalab/shared';
import type { ReservationService } from '../services/reservation.service';

export class ReservationController {
  constructor(private readonly reservations: ReservationService) {}

  /** RF-08 */
  create = async (req: Request, res: Response) => {
    const reservation = await this.reservations.create(req.user!, req.body as CreateReservationInput);
    res.status(201).location(`${req.baseUrl}/${reservation.id}`).json(reservation);
  };

  /** RF-09 */
  listMine = async (req: Request, res: Response) => {
    res.json(await this.reservations.listMine(req.user!.id));
  };

  /** RF-10 */
  cancel = async (req: Request, res: Response) => {
    await this.reservations.cancel(req.user!, (req.params as IdParam).id);
    res.status(204).end();
  };
}
