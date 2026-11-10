import type { NowOccupancy } from '@reservalab/shared';
import { ApiRequestError, fetchNow } from './api';
import { $, el, showMessage } from './dom';
import { formatClock } from './time';

/**
 * Pantalla informativa de la entrada del edificio. No inicia sesión: se
 * autentica con una API key (permiso read:now) incrustada al compilar.
 */
const API_KEY: string = import.meta.env.VITE_DISPLAY_API_KEY ?? '';
const REFRESH_MS = 30_000;

function render(data: NowOccupancy) {
  $('buildings').replaceChildren(
    ...data.buildings.map((b) =>
      el('section', {}, [
        el('h2', { text: `${b.building} · ${b.occupied} de ${b.total} ocupados` }),
        el('table', {}, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: 'Espacio' }),
              el('th', { text: 'Estado' }),
              el('th', { text: 'Actividad' }),
            ]),
          ]),
          el(
            'tbody',
            {},
            b.spaces.map((s) =>
              el('tr', {}, [
                el('td', { text: `${s.name} (${s.capacity})` }),
                el('td', {}, [
                  el('span', {
                    text: s.status === 'BUSY' ? 'Ocupado' : 'Libre',
                    className: `badge ${s.status}`,
                  }),
                ]),
                el('td', {
                  text: s.current ? `${s.current.purpose} · ${s.current.startTime}-${s.current.endTime}` : '',
                }),
              ]),
            ),
          ),
        ]),
      ]),
    ),
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
    $('updated').textContent = formatClock(new Date());
    $('cache').textContent = cache ?? '-';
  } catch (err) {
    const text =
      err instanceof ApiRequestError ? `Error ${err.status}: ${err.message}` : 'Sin conexión con la API';
    showMessage(message, text, 'error');
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
