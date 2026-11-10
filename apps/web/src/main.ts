import type { AvailabilityBlock, PublicUser, Reservation, Role, Space } from '@reservalab/shared';
import { api, ApiRequestError } from './api';
import { $, el, showMessage, toast } from './dom';
import { dateParts, formatLongDate, formatTimeRange, todayInGuatemala } from './time';

/**
 * Aplicación de una sola página: inicio de sesión y reservas.
 * Los tokens viven solo en memoria (api.ts), así que nunca se recarga la página:
 * las pantallas se muestran u ocultan.
 */

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
};

const errorText = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'No se pudo conectar con la API';

const canReserve = () => {
  const role = api.currentUser()?.role;
  return role === 'DOCENTE' || role === 'ADMIN';
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

async function showHealth() {
  const pill = $('health');
  try {
    const h = await api.health();
    pill.textContent = h.status === 'ok' ? 'Sistema en línea' : 'Servicio degradado';
    pill.title = `Base de datos: ${h.services.database} · Caché: ${h.services.cache}`;
    pill.className = `status-pill ${h.status === 'ok' ? 'ok' : 'error'}`;
  } catch {
    pill.textContent = 'API sin conexión';
    pill.className = 'status-pill error';
  }
}

// ---------- Sesión ----------

function enterApp(user: PublicUser) {
  $('user-avatar').textContent = initials(user.name);
  $('user-name').textContent = user.name;
  $('user-role').textContent = ROLE_LABEL[user.role];
  $('user-chip').hidden = false;
  $('role-hint').hidden = canReserve();
  $('login-view').hidden = true;
  $('reservations-view').hidden = false;
}

function showLogin(message?: string) {
  $('reservations-view').hidden = true;
  $('user-chip').hidden = true;
  $('login-view').hidden = false;
  showMessage($('login-message'), message ?? '', 'error');
}

const loginForm = $<HTMLFormElement>('login-form');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const message = $('login-message');
  if (!email || !password) {
    showMessage(message, 'Escribe tu correo y tu contraseña.', 'error');
    return;
  }

  const submit = $<HTMLButtonElement>('login-submit');
  submit.disabled = true;
  submit.textContent = 'Entrando…';
  showMessage(message, '');
  try {
    const user = await api.login(email, password);
    enterApp(user);
    await loadSpaces();
    await Promise.all([loadAvailability(), loadMyReservations()]);
  } catch (err) {
    showMessage(message, errorText(err), 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Entrar';
  }
});

// Atajos para la demo: llenan el formulario con un usuario del seed.
document.querySelectorAll<HTMLButtonElement>('.chip[data-email]').forEach((chip) =>
  chip.addEventListener('click', () => {
    (loginForm.elements.namedItem('email') as HTMLInputElement).value = chip.dataset.email ?? '';
    (loginForm.elements.namedItem('password') as HTMLInputElement).value = 'Password123!';
    $('login-submit').focus();
  }),
);

api.onSessionExpired(() => showLogin('Tu sesión expiró. Vuelve a iniciar sesión.'));

$('logout').addEventListener('click', async () => {
  await api.logout();
  loginForm.reset();
  showLogin();
});

$('expire-token').addEventListener('click', async () => {
  api.expireAccessToken();
  // La siguiente solicitud recibe 401; el cliente renueva con /auth/refresh y reintenta.
  await loadMyReservations();
  toast('El access token se renovó automáticamente con el refresh token.', 'info');
});

// ---------- Disponibilidad ----------

let spaces: Space[] = [];

async function loadSpaces() {
  spaces = await api.listSpaces();
  const select = $<HTMLSelectElement>('space-select');
  const byBuilding = new Map<string, Space[]>();
  for (const s of spaces) byBuilding.set(s.building, [...(byBuilding.get(s.building) ?? []), s]);
  select.replaceChildren(
    ...[...byBuilding].map(([building, list]) =>
      el(
        'optgroup',
        { attrs: { label: building } },
        list.map((s) => el('option', { text: s.name, attrs: { value: s.id } })),
      ),
    ),
  );
  const date = $<HTMLInputElement>('date-input');
  date.min = todayInGuatemala();
  if (!date.value) date.value = todayInGuatemala();
}

function blockState(block: AvailabilityBlock): 'FREE' | 'BUSY' | 'PAST' {
  if (new Date(block.endAt) <= new Date()) return 'PAST';
  return block.status;
}

const STATE_LABEL = { FREE: 'Libre', BUSY: 'Ocupado', PAST: 'Pasado' } as const;

async function loadAvailability() {
  const spaceId = $<HTMLSelectElement>('space-select').value;
  const date = $<HTMLInputElement>('date-input').value;
  const list = $('blocks');
  const summary = $('space-summary');
  if (!spaceId || !date) return;

  list.replaceChildren(
    ...Array.from({ length: 8 }, () => el('li', {}, [el('div', { className: 'slot loading' })])),
  );
  try {
    const availability = await api.availability(spaceId, date);
    const states = availability.blocks.map(blockState);
    const free = states.filter((s) => s === 'FREE').length;
    summary.replaceChildren(
      el('span', { className: 'space-summary' }, [
        el('span', {}, [el('b', { text: availability.spaceName }), ` · ${availability.building}`]),
        el('span', { text: formatLongDate(date) }),
        el('span', { text: `Horario ${availability.openTime}–${availability.closeTime}` }),
        el('span', { text: `Capacidad ${spaces.find((s) => s.id === spaceId)?.capacity ?? '–'} personas` }),
        el('span', {}, [el('b', { text: String(free) }), ` de ${states.length} bloques libres`]),
      ]),
    );
    list.replaceChildren(...availability.blocks.map((b, i) => renderBlock(spaceId, b, states[i]!)));
  } catch (err) {
    summary.textContent = '';
    list.replaceChildren(el('li', { className: 'alert error', text: errorText(err) }));
  }
}

function renderBlock(
  spaceId: string,
  block: AvailabilityBlock,
  state: 'FREE' | 'BUSY' | 'PAST',
): HTMLLIElement {
  const content = [el('strong', { text: `${block.startTime} – ${block.endTime}` })];

  if (state === 'FREE' && canReserve()) {
    const button = el('button', { className: 'slot FREE', attrs: { type: 'button' } }, [
      ...content,
      el('span', { text: 'Reservar' }),
    ]);
    button.setAttribute('aria-label', `Reservar de ${block.startTime} a ${block.endTime}`);
    button.addEventListener('click', () => void reserve(spaceId, block, button));
    return el('li', {}, [button]);
  }
  return el('li', {}, [
    el('div', { className: `slot ${state}` }, [...content, el('span', { text: STATE_LABEL[state] })]),
  ]);
}

async function reserve(spaceId: string, block: AvailabilityBlock, button: HTMLButtonElement) {
  button.disabled = true;
  const label = button.querySelector('span');
  if (label) label.textContent = 'Reservando…';
  try {
    await api.createReservation({
      spaceId,
      startAt: block.startAt,
      endAt: block.endAt,
      purpose: $<HTMLInputElement>('purpose-input').value.trim() || 'Clase',
    });
    toast(`Reserva confirmada de ${block.startTime} a ${block.endTime}.`, 'ok');
  } catch (err) {
    // Aquí se muestra el 409 de traslape con el mensaje que devuelve la API.
    toast(errorText(err), 'error', 6000);
  } finally {
    await Promise.all([loadAvailability(), loadMyReservations()]);
  }
}

// ---------- Mis reservas ----------

let filter: 'upcoming' | 'history' = 'upcoming';
let myReservations: Reservation[] = [];

const isUpcoming = (r: Reservation) => r.status === 'CONFIRMED' && new Date(r.endAt) > new Date();

async function loadMyReservations() {
  try {
    myReservations = await api.myReservations();
    renderMyReservations();
  } catch (err) {
    $('my-reservations').replaceChildren(el('li', { className: 'empty', text: errorText(err) }));
  }
}

function renderMyReservations() {
  const list = $('my-reservations');
  const rows = myReservations
    .filter((r) => (filter === 'upcoming' ? isUpcoming(r) : !isUpcoming(r)))
    .sort((a, b) =>
      filter === 'upcoming' ? a.startAt.localeCompare(b.startAt) : b.startAt.localeCompare(a.startAt),
    );

  if (rows.length === 0) {
    list.replaceChildren(
      el('li', { className: 'empty' }, [
        el('strong', {
          text: filter === 'upcoming' ? 'No tienes reservas próximas' : 'Sin historial todavía',
        }),
        el('span', {
          text: filter === 'upcoming' && canReserve() ? 'Elige un bloque libre para reservar.' : '',
        }),
      ]),
    );
    return;
  }
  list.replaceChildren(...rows.map(renderReservation));
}

function renderReservation(r: Reservation): HTMLLIElement {
  const { day, month } = dateParts(r.startAt);
  const upcoming = isUpcoming(r);
  const status =
    r.status === 'CANCELLED'
      ? el('span', { className: 'badge CANCELLED', text: 'Cancelada' })
      : el('span', { className: 'badge CONFIRMED', text: upcoming ? 'Confirmada' : 'Finalizada' });

  const action = upcoming
    ? el('button', { className: 'btn btn-danger-ghost', text: 'Cancelar', attrs: { type: 'button' } })
    : status;
  if (upcoming) {
    action.addEventListener('click', async () => {
      if (!confirm(`¿Cancelar la reserva de ${formatTimeRange(r.startAt, r.endAt)}?`)) return;
      (action as HTMLButtonElement).disabled = true;
      try {
        await api.cancelReservation(r.id);
        toast('Reserva cancelada.', 'ok');
      } catch (err) {
        toast(errorText(err), 'error');
      }
      await Promise.all([loadAvailability(), loadMyReservations()]);
    });
  }

  return el('li', { className: `res-item ${r.status}${upcoming ? '' : ' done'}` }, [
    el('div', { className: 'date-badge' }, [el('b', { text: day }), el('small', { text: month })]),
    el('div', { className: 'res-info' }, [
      el('strong', { text: r.space?.name ?? 'Espacio' }),
      el('span', { text: `${formatTimeRange(r.startAt, r.endAt)} · ${r.space?.building ?? ''}` }),
      el('span', { text: r.purpose }),
      ...(upcoming ? [el('span', {}, [status])] : []),
    ]),
    action,
  ]);
}

document.querySelectorAll<HTMLButtonElement>('.tab[data-filter]').forEach((tab) =>
  tab.addEventListener('click', () => {
    filter = tab.dataset.filter === 'history' ? 'history' : 'upcoming';
    document
      .querySelectorAll('.tab[data-filter]')
      .forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    renderMyReservations();
  }),
);

// ---------- Eventos de filtros ----------

$('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void loadAvailability();
});
$('space-select').addEventListener('change', () => void loadAvailability());
$('date-input').addEventListener('change', () => void loadAvailability());

void showHealth();
