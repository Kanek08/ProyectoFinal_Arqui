import { describe, expect, it, vi } from 'vitest';
import { createHttpNotificationService } from '../../src/services/notification.service';
import type { ReservationNotification } from '../../src/services/notification.service';

/**
 * Prueba de integración contra el servicio de notificaciones simulado con Mockoon
 * (contenedor "mockoon" de docker compose, puerto 3001). Verifica el contrato:
 * POST /notifications responde 202 con { status: "accepted", event }.
 */
const baseUrl = process.env.NOTIFICATIONS_URL ?? 'http://localhost:3001';

const notification: ReservationNotification = {
  event: 'reservation.confirmed',
  reservationId: '11111111-1111-4111-8111-111111111111',
  spaceId: '22222222-2222-4222-8222-222222222222',
  spaceName: 'Laboratorio 1',
  building: 'Edificio A',
  userId: '33333333-3333-4333-8333-333333333333',
  startAt: '2026-11-20T15:00:00.000Z',
  endAt: '2026-11-20T16:00:00.000Z',
  purpose: 'Prueba Mockoon',
  occurredAt: new Date().toISOString(),
};

describe('Servicio de notificaciones simulado (Mockoon)', () => {
  it('acepta el evento con 202 y devuelve el contrato esperado', async () => {
    const res = await fetch(`${baseUrl}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string; event: string; notificationId: string };
    expect(body).toMatchObject({ status: 'accepted', event: 'reservation.confirmed' });
    expect(body.notificationId).toBeTruthy();
  });

  it('el adaptador HTTP de la API envía la notificación y lo registra', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const service = createHttpNotificationService({ baseUrl, logger });
    await expect(service.notify({ ...notification, event: 'reservation.cancelled' })).resolves.toBe(true);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
