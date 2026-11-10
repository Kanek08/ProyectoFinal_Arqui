import { defineConfig } from 'vite';

export default defineConfig({
  // Lee VITE_API_URL y VITE_DISPLAY_API_KEY del .env de la raíz del monorepo.
  envDir: '../..',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    // Dos páginas: la app con login/reservas y la pantalla informativa (sin login).
    rollupOptions: {
      input: { main: 'index.html', pantalla: 'pantalla.html' },
    },
  },
});
