import type { Request, Response } from 'express';
import type { CreateSpaceInput, IdParam, SpaceQuery, UpdateSpaceInput } from '@reservalab/shared';
import type { SpaceService } from '../services/space.service';

export class SpaceController {
  constructor(private readonly spaces: SpaceService) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.spaces.list(req.query as SpaceQuery));
  };

  getById = async (req: Request, res: Response) => {
    res.json(await this.spaces.getById((req.params as IdParam).id));
  };

  create = async (req: Request, res: Response) => {
    const space = await this.spaces.create(req.body as CreateSpaceInput);
    res.status(201).location(`${req.baseUrl}/${space.id}`).json(space);
  };

  update = async (req: Request, res: Response) => {
    res.json(await this.spaces.update((req.params as IdParam).id, req.body as UpdateSpaceInput));
  };

  remove = async (req: Request, res: Response) => {
    await this.spaces.remove((req.params as IdParam).id);
    res.status(204).end();
  };
}
