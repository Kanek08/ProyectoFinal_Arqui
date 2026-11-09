import { defineConfig } from 'vite';

export default defineConfig({
  // Lee VITE_API_URL del .env de la raíz del monorepo.
  envDir: '../..',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
