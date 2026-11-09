#!/bin/sh
set -e

echo "[entrypoint] Aplicando migraciones..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Ejecutando seed (solo si la base está vacía)..."
node dist/seed.js

echo "[entrypoint] Iniciando API..."
exec node dist/server.js
