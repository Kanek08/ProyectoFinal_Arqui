import type { NowOccupancy, NowSpace } from '@reservalab/shared';
import { ApiRequestError, fetchNow } from './api';
import { $, el, showMessage } from './dom';
import { formatClock, formatLongDate } from './time';

/**
 * Pantalla informativa de la entrada del edificio. No inicia sesión: se
 * autentica con una API key (permiso read:now) incrustada al compilar.
 */
const API_KEY: string = import.meta.env.VITE_DISPLAY_API_KEY ?? '';
const REFRESH_SECONDS = 30;

function renderRoom(s: NowSpace): HTMLElement {
  const busy = s.status === 'BUSY';
  return el('article', { className: `room ${s.status}` }, [
    el('div', { className: 'room-top' }, [
      el('h3', { text: s.name }),
      el('span', { className: `badge ${s.status}`, text: busy ? 'Ocupado' : 'Disponible' }),
    ]),
    busy && s.current
      ? el('p', { className: 'activity', text: `${s.current.purpose} · hasta las ${s.current.endTime}` })
      : el('p', { text: 'Sin actividad en este momento' }),
    el('p', { text: `Capacidad: ${s.capacity} personas` }),
  ]);
}

function render(data: NowOccupancy) {
  const total = data.buildings.reduce((n, b) => n + b.total, 0);
  const busy = data.buildings.reduce((n, b) => n + b.occupied, 0);
  $('stat-total').textContent = String(total);
  $('stat-free').textContent = String(total - busy);
  $('stat-busy').textContent = String(busy);

  $('buildings').replaceChildren(
    ...data.buildings.map((b) => {
      const pct = b.total ? Math.round((b.occupied / b.total) * 100) : 0;
      return el('section', { className: 'building' }, [
        el('div', { className: 'building-head' }, [
          el('h2', { text: b.building }),
          el('div', { className: 'meter' }, [
            el('span', { text: `${b.occupied} de ${b.total} ocupados (${pct} %)` }),
            el('div', {}, [el('i', { attrs: { style: `width: ${pct}%` } })]),
          ]),
        ]),
        el('div', { className: 'rooms' }, b.spaces.map(renderRoom)),
      ]);
    }),
  );
}

async function refresh() {
  const message = $('board-message');
  if (!API_KEY) {
    showMessage(message, 'Falta VITE_DISPLAY_API_KEY: configure la API key de la pantalla en .env.', 'error');
    return;
  }
  try {
    const { data, cache } = await fetchNow(API_KEY);
    render(data);
    showMessage(message, '');
    $('updated').textContent = formatClock(new Date(), false);
    $('cache').textContent = cache ?? '–';
  } catch (err) {
    const text =
      err instanceof ApiRequestError ? `Error ${err.status}: ${err.message}` : 'Sin conexión con la API';
    showMessage(message, text, 'error');
  }
}

// Reloj y cuenta regresiva hasta la próxima actualización.
let remaining = REFRESH_SECONDS;
function tick() {
  const now = new Date();
  $('clock').textContent = formatClock(now, false);
  $('today').textContent = formatLongDate(now);
  $('countdown').textContent = String(remaining);
  $('progress').style.width = `${((REFRESH_SECONDS - remaining) / REFRESH_SECONDS) * 100}%`;
  if (remaining === 0) {
    remaining = REFRESH_SECONDS;
    void refresh();
  } else {
    remaining -= 1;
  }
}

tick();
void refresh();
setInterval(tick, 1000);
