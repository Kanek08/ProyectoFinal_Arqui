/**
 * Cliente del servicio externo de notificaciones (simulado con Mockoon).
 * Es un adaptador de salida (SOA): la reserva no depende de que este servicio
 * responda. Si falla o tarda más de 3 s, se registra el error y se continúa.
 */

export type NotificationEvent = 'reservation.confirmed' | 'reservation.cancelled';

export interface ReservationNotification {
  event: NotificationEvent;
  reservationId: string;
  spaceId: string;
  spaceName: string;
  building: string;
  userId: string;
  startAt: string;
  endAt: string;
  purpose: string;
  occurredAt: string;
}

export interface NotificationService {
  /** Nunca lanza excepciones: devuelve true si el servicio aceptó la notificación. */
  notify(notification: ReservationNotification): Promise<boolean>;
}

export interface NotificationLogger {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface HttpNotificationOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger: NotificationLogger;
}

export const NOTIFICATION_TIMEOUT_MS = 3000;

export function createHttpNotificationService(options: HttpNotificationOptions): NotificationService {
  const url = `${options.baseUrl.replace(/\/+$/, '')}/notifications`;
  const timeoutMs = options.timeoutMs ?? NOTIFICATION_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async notify(notification) {
      const context = { event: notification.event, reservationId: notification.reservationId };
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          options.logger.error(
            { ...context, status: res.status },
            'El servicio de notificaciones rechazó el evento',
          );
          return false;
        }
        options.logger.info(context, 'Notificación enviada');
        return true;
      } catch (err) {
        options.logger.error(
          { ...context, err: err instanceof Error ? err.message : String(err) },
          'No se pudo enviar la notificación (la reserva no se ve afectada)',
        );
        return false;
      }
    },
  };
}
