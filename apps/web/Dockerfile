# Imagen de la interfaz web. Se construye desde la raíz del monorepo.
FROM node:22-slim

RUN npm install -g pnpm@10.34.9
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @reservalab/web...

COPY packages/shared packages/shared
COPY apps/web apps/web

# La URL de la API se incrusta al compilar (el navegador la usa desde la máquina del usuario).
ARG VITE_API_URL=http://localhost:3000/api/v1
ENV VITE_API_URL=$VITE_API_URL
# API key de la pantalla informativa (read:now); el seed registra la misma key.
ARG VITE_DISPLAY_API_KEY=
ENV VITE_DISPLAY_API_KEY=$VITE_DISPLAY_API_KEY
RUN pnpm --filter @reservalab/shared build && pnpm --filter @reservalab/web build

WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "preview"]
