import type { Request, Response } from 'express';
import type { LoginInput, RefreshInput, RegisterInput } from '@reservalab/shared';
import type { AuthService } from '../services/auth.service';

/**
 * Controlador (MVC): traduce HTTP <-> servicio. No contiene reglas de negocio
 * ni accede a la base de datos; el body ya llega validado por el middleware validate.
 */
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (req: Request, res: Response) => {
    const user = await this.auth.register(req.body as RegisterInput);
    res.status(201).json(user);
  };

  login = async (req: Request, res: Response) => {
    res.json(await this.auth.login(req.body as LoginInput));
  };

  refresh = async (req: Request, res: Response) => {
    res.json(await this.auth.refresh((req.body as RefreshInput).refreshToken));
  };

  logout = async (req: Request, res: Response) => {
    await this.auth.logout(req.user!.id, (req.body as RefreshInput).refreshToken);
    res.status(204).end();
  };
}
