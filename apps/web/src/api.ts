import type {
  ApiError,
  Availability,
  CreateReservationInput,
  Health,
  LoginResponse,
  NowOccupancy,
  PublicUser,
  Reservation,
  Space,
} from '@reservalab/shared';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * Sesión guardada SOLO en memoria (una variable del módulo): no se usa
 * localStorage ni cookies. Al recargar la página la sesión se pierde a propósito.
 */
let session: { accessToken: string; refreshToken: string; user: PublicUser } | null = null;
let onSessionExpired: () => void = () => undefined;

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `Error HTTP ${status}`);
  }
}

/** Una sola renovación a la vez aunque varias solicitudes reciban 401 juntas. */
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const current = session;
  if (!current) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) return false;
      const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
      session = { ...current, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * Cliente fetch con JWT. Si la API responde 401 (access token vencido), pide uno
 * nuevo con /auth/refresh y repite la solicitud una vez. Si el refresh también
 * falla, cierra la sesión en memoria y avisa a la interfaz.
 */
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry && session && !path.startsWith('/auth/')) {
    if (await refreshTokens()) return request<T>(path, init, false);
    session = null;
    onSessionExpired();
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError | null);
  return body as T;
}

export const api = {
  onSessionExpired(callback: () => void) {
    onSessionExpired = callback;
  },

  currentUser: (): PublicUser | null => session?.user ?? null,

  health: () => fetch(`${API_URL}/health`).then((r) => r.json() as Promise<Health>),

  async login(email: string, password: string): Promise<PublicUser> {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    session = { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
    return result.user;
  },

  async logout(): Promise<void> {
    if (session) {
      await request<void>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }).catch(() => undefined);
    }
    session = null;
  },

  listSpaces: () => request<Space[]>('/spaces'),

  availability: (spaceId: string, date: string) =>
    request<Availability>(`/spaces/${spaceId}/availability?date=${encodeURIComponent(date)}`),

  myReservations: () => request<Reservation[]>('/reservations/me'),

  createReservation: (input: CreateReservationInput) =>
    request<Reservation>('/reservations', { method: 'POST', body: JSON.stringify(input) }),

  cancelReservation: (id: string) => request<void>(`/reservations/${id}`, { method: 'DELETE' }),

  /** Para la demo: invalida el access token en memoria y así se ve la renovación automática. */
  expireAccessToken() {
    if (session) session = { ...session, accessToken: 'token-vencido' };
  },
};

/** Ocupación actual para la pantalla informativa: usa API key, no JWT. */
export async function fetchNow(apiKey: string): Promise<{ data: NowOccupancy; cache: string | null }> {
  const res = await fetch(`${API_URL}/now`, { headers: { 'X-API-Key': apiKey } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError | null);
  return { data: body as NowOccupancy, cache: res.headers.get('X-Cache') };
}
