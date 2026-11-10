import type { AvailabilityBlock, Reservation, Space } from '@reservalab/shared';
import { api, ApiRequestError } from './api';
import { $, el, showMessage } from './dom';
import { formatRange, todayInGuatemala } from './time';

/**
 * Aplicación de una sola página: inicio de sesión y reservas.
 * Los tokens viven solo en memoria (api.ts), así que no se recarga la página:
 * las pantallas se muestran u ocultan.
 */

const errorText = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'No se pudo conectar con la API';

const canReserve = () => {
  const role = api.currentUser()?.role;
  return role === 'DOCENTE' || role === 'ADMIN';
};

async function showHealth() {
  const target = $('health');
  try {
    const h = await api.health();
    target.textContent = `${h.status} (base de datos ${h.services.database}, caché ${h.services.cache})`;
    target.className = h.status === 'ok' ? 'ok' : 'error';
  } catch {
    target.textContent = 'sin conexión';
    target.className = 'error';
  }
}

function showLogin(message?: string) {
  $('reservations-view').hidden = true;
  $('login-view').hidden = false;
  if (message) showMessage($('login-message'), message, 'error');
}

// ---------- Pantalla 1: inicio de sesión ----------

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target as HTMLFormElement);
  const message = $('login-message');
  showMessage(message, 'Entrando...');
  try {
    const user = await api.login(String(form.get('email')), String(form.get('password')));
    showMessage(message, '');
    $('session-user').textContent = `${user.name} · ${user.email} · rol ${user.role}`;
    $('role-hint').hidden = canReserve();
    $('login-view').hidden = true;
    $('reservations-view').hidden = false;
    await loadSpaces();
    await Promise.all([loadAvailability(), loadMyReservations()]);
  } catch (err) {
    showMessage(message, errorText(err), 'error');
  }
});

api.onSessionExpired(() => showLogin('La sesión expiró, vuelve a iniciar sesión.'));

$('logout').addEventListener('click', async () => {
  await api.logout();
  showLogin();
});

$('expire-token').addEventListener('click', async () => {
  api.expireAccessToken();
  // La siguiente solicitud recibe 401, el cliente renueva con /auth/refresh y reintenta.
  await loadMyReservations();
  showMessage($('reserve-message'), 'Access token renovado automáticamente con el refresh token.', 'ok');
});

// ---------- Pantalla 2: reservas ----------

let spaces: Space[] = [];

async function loadSpaces() {
  spaces = await api.listSpaces();
  const select = $<HTMLSelectElement>('space-select');
  select.replaceChildren(
    ...spaces.map((s) =>
      el('option', {
        text: `${s.building} · ${s.name} (${s.capacity} personas, ${s.openTime}-${s.closeTime})`,
        attrs: { value: s.id },
      }),
    ),
  );
  const date = $<HTMLInputElement>('date-input');
  if (!date.value) date.value = todayInGuatemala();
}

async function loadAvailability() {
  const spaceId = $<HTMLSelectElement>('space-select').value;
  const date = $<HTMLInputElement>('date-input').value;
  const list = $('blocks');
  if (!spaceId || !date) return;
  try {
    const availability = await api.availability(spaceId, date);
    list.replaceChildren(...availability.blocks.map((b) => renderBlock(spaceId, b)));
  } catch (err) {
    list.replaceChildren(el('li', { text: errorText(err), className: 'error' }));
  }
}

function renderBlock(spaceId: string, block: AvailabilityBlock): HTMLLIElement {
  const label = el('span', { text: `${block.startTime} - ${block.endTime}` });
  const item = el('li', { className: block.status }, [label]);
  if (block.status === 'BUSY') {
    item.append(el('span', { text: 'Ocupado' }));
  } else if (canReserve()) {
    const button = el('button', { text: 'Reservar', attrs: { type: 'button' } });
    button.addEventListener('click', () => void reserve(spaceId, block, button));
    item.append(button);
  } else {
    item.append(el('span', { text: 'Libre' }));
  }
  return item;
}

async function reserve(spaceId: string, block: AvailabilityBlock, button: HTMLButtonElement) {
  const message = $('reserve-message');
  button.disabled = true;
  try {
    await api.createReservation({
      spaceId,
      startAt: block.startAt,
      endAt: block.endAt,
      purpose: $<HTMLInputElement>('purpose-input').value || 'Clase',
    });
    showMessage(message, `Reserva confirmada: ${block.startTime} - ${block.endTime}.`, 'ok');
  } catch (err) {
    // Aquí se ve el 409 de traslape con el mensaje que devuelve la API.
    const prefix = err instanceof ApiRequestError ? `Error ${err.status}: ` : '';
    showMessage(message, prefix + errorText(err), 'error');
  } finally {
    button.disabled = false;
    await Promise.all([loadAvailability(), loadMyReservations()]);
  }
}

async function loadMyReservations() {
  const body = $('my-reservations');
  try {
    const reservations = await api.myReservations();
    body.replaceChildren(
      ...(reservations.length
        ? reservations.map(renderReservation)
        : [el('tr', {}, [el('td', { text: 'Sin reservas.', attrs: { colspan: '5' } })])]),
    );
  } catch (err) {
    body.replaceChildren(el('tr', {}, [el('td', { text: errorText(err), attrs: { colspan: '5' } })]));
  }
}

function renderReservation(r: Reservation): HTMLTableRowElement {
  const actions = el('td');
  if (r.status === 'CONFIRMED') {
    const button = el('button', { text: 'Cancelar', className: 'secondary', attrs: { type: 'button' } });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api.cancelReservation(r.id);
        showMessage($('reserve-message'), 'Reserva cancelada.', 'ok');
      } catch (err) {
        showMessage($('reserve-message'), errorText(err), 'error');
      }
      await Promise.all([loadAvailability(), loadMyReservations()]);
    });
    actions.append(button);
  }
  return el('tr', { className: r.status }, [
    el('td', { text: r.space ? `${r.space.building} · ${r.space.name}` : r.spaceId }),
    el('td', { text: formatRange(r.startAt, r.endAt) }),
    el('td', { text: r.purpose }),
    el('td', { text: r.status === 'CONFIRMED' ? 'Confirmada' : 'Cancelada' }),
    actions,
  ]);
}

$('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showMessage($('reserve-message'), '');
  void loadAvailability();
});
$('space-select').addEventListener('change', () => void loadAvailability());
$('date-input').addEventListener('change', () => void loadAvailability());

void showHealth();
