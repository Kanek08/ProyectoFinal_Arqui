import { api, ApiRequestError } from './api';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta el elemento #${id}`);
  return el;
}

async function showHealth() {
  const el = $('health');
  try {
    const h = await api.health();
    el.textContent = `${h.status} (base de datos: ${h.services.database}, caché: ${h.services.cache})`;
    el.className = h.status === 'ok' ? 'ok' : 'error';
  } catch {
    el.textContent = 'sin conexión';
    el.className = 'error';
  }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target as HTMLFormElement);
  const errorEl = $('login-error');
  errorEl.textContent = '';
  try {
    const { user } = await api.login(String(form.get('email')), String(form.get('password')));
    $('session-user').textContent = `${user.name} (${user.email}) - rol ${user.role}`;
    $('login-section').hidden = true;
    $('session-section').hidden = false;
    const spaces = await api.listSpaces();
    $('spaces').textContent = spaces
      .map((s) => `${s.building} | ${s.name} | capacidad ${s.capacity} | ${s.openTime}-${s.closeTime}`)
      .join('\n');
  } catch (err) {
    errorEl.textContent = err instanceof ApiRequestError ? err.message : 'No se pudo conectar con la API';
  }
});

$('logout').addEventListener('click', async () => {
  await api.logout();
  $('session-section').hidden = true;
  $('login-section').hidden = false;
});

void showHealth();
