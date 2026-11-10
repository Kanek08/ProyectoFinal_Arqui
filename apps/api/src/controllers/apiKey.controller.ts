import type { Request, Response } from 'express';
import type { CreateApiKeyInput, IdParam } from '@reservalab/shared';
import type { ApiKeyService } from '../services/apiKey.service';

/** RF-12 */
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  create = async (req: Request, res: Response) => {
    const created = await this.apiKeys.create(req.body as CreateApiKeyInput);
    // La key completa viaja solo en esta respuesta; no debe quedar en ninguna caché HTTP.
    res.status(201).set('Cache-Control', 'no-store').location(`${req.baseUrl}/${created.id}`).json(created);
  };

  list = async (_req: Request, res: Response) => {
    res.json(await this.apiKeys.list());
  };

  revoke = async (req: Request, res: Response) => {
    await this.apiKeys.revoke((req.params as IdParam).id);
    res.status(204).end();
  };
}
