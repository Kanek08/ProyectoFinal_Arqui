# Imagen de la API. Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile .
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.34.9

WORKDIR /app

# 1) Dependencias (capa cacheada mientras no cambien los package.json / lockfile)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @reservalab/api...

# 2) Código y compilación (shared primero, luego api)
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @reservalab/shared build && pnpm --filter @reservalab/api build

# El script de arranque aplica migraciones, corre el seed si la base está vacía e inicia la API.
RUN sed -i 's/\r$//' apps/api/docker-entrypoint.sh

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "./docker-entrypoint.sh"]
