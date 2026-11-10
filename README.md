# ReservaLab

API REST en TypeScript para reservar laboratorios y salones de la Facultad de Ingeniería, sin reservas traslapadas.
Proyecto de curso de Arquitectura de Sistemas I

## Levantar el sistema

```bash
cp .env.example .env
docker compose up --build
```

| Servicio                 | URL                                 |
| ------------------------ | ----------------------------------- |
| API                      | http://localhost:3000/api/v1        |
| Health                   | http://localhost:3000/api/v1/health |
| Web (login y reservas)   | http://localhost:5173               |
| Pantalla informativa     | http://localhost:5173/pantalla.html |
| Mockoon (notificaciones) | http://localhost:3001               |
| PostgreSQL / Redis       | localhost:5432 / localhost:6379     |

> Si ya tiene PostgreSQL instalado en su máquina, en el `.env` ponga `POSTGRES_PORT=5433` y cambie `5432` por `5433`
> en `DATABASE_URL` y `DATABASE_URL_TEST`.

Para borrar todo (incluidos los datos): `docker compose down -v`.

## Usuarios de prueba

| Rol           | Correo                    | Contraseña     |
| ------------- | ------------------------- | -------------- |
| Administrador | admin@reservalab.edu      | `Password123!` |
| Docente       | docente@reservalab.edu    | `Password123!` |
| Estudiante    | estudiante@reservalab.edu | `Password123!` |

API key de la pantalla informativa: la que esté en `DISPLAY_API_KEY` del `.env` (el seed la registra con los
permisos `read:now`, `read:spaces` y `read:availability`; en la base solo queda su hash).

## Endpoints implementados

Todos bajo `/api/v1`.

| Código | Endpoint                                                  | Acceso                                    | Estado |
| ------ | --------------------------------------------------------- | ----------------------------------------- | ------ |
| RF-01  | `POST /auth/register`                                     | Público                                   | ✅     |
| RF-02  | `POST /auth/login`                                        | Público                                   | ✅     |
| RF-03  | `POST /auth/refresh`                                      | Refresh token                             | ✅     |
| RF-04  | `POST /auth/logout`                                       | JWT                                       | ✅     |
| RF-05  | `GET /spaces?building=&minCapacity=`                      | JWT o API key `read:spaces` (caché 60 s)  | ✅     |
| RF-06  | `POST/PATCH/DELETE /spaces/:id`                           | JWT, ADMIN                                | ✅     |
| RF-07  | `GET /spaces/:id/availability?date=`                      | JWT o API key `read:availability` (caché) | ✅     |
| RF-08  | `POST /reservations`                                      | JWT, DOCENTE o ADMIN                      | ✅     |
| RF-09  | `GET /reservations/me`                                    | JWT                                       | ✅     |
| RF-10  | `DELETE /reservations/:id`                                | JWT, dueño o ADMIN                        | ✅     |
| RF-11  | `GET /now`                                                | API key `read:now` (caché 60 s)           | ✅     |
| RF-12  | `POST /api-keys`, `GET /api-keys`, `DELETE /api-keys/:id` | JWT, ADMIN                                | ✅     |
| RF-13  | `GET /health`                                             | Público                                   | ✅     |

Errores siempre en JSON: `{ "error": { "code", "message", "details?" } }`. Traslape de reservas: `409
RESERVATION_OVERLAP`. Límite por API key: `429` con `Retry-After`.

## Pruebas

```bash
docker compose up -d postgres redis mockoon   # las pruebas de integración usan Postgres, Redis y Mockoon reales
pnpm build && pnpm lint && pnpm test
pnpm test:coverage                            # falla si la cobertura baja de 70 %
```

## Guion de demo (fase 2)

Comandos para Git Bash. Antes: `docker compose down -v && docker compose up --build` y esperar a que `web` quede
`healthy` (`docker compose ps`).

```bash
API=http://localhost:3000/api/v1
KEY=$(grep '^DISPLAY_API_KEY=' .env | cut -d= -f2)
DAY=$(date -d tomorrow +%F)
```

1. **Salud:** `curl -s $API/health` → `status: ok`, base de datos y caché `up`.
2. **Login como docente** y guardar el token:
   ```bash
   DOC=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"docente@reservalab.edu","password":"Password123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
   SPACE=$(curl -s $API/spaces -H "Authorization: Bearer $DOC" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')
   ```
3. **Caché MISS → HIT** (ver el encabezado `X-Cache`):
   ```bash
   curl -si "$API/spaces/$SPACE/availability?date=$DAY" -H "Authorization: Bearer $DOC" | grep -i x-cache   # MISS
   curl -si "$API/spaces/$SPACE/availability?date=$DAY" -H "Authorization: Bearer $DOC" | grep -i x-cache   # HIT
   ```
4. **Reservar** de 10:00 a 12:00 (hora de Guatemala) → `201`:
   ```bash
   curl -s -X POST $API/reservations -H "Authorization: Bearer $DOC" -H 'Content-Type: application/json' \
     -d "{\"spaceId\":\"$SPACE\",\"startAt\":\"${DAY}T10:00:00-06:00\",\"endAt\":\"${DAY}T12:00:00-06:00\",\"purpose\":\"Demo\"}"
   ```
5. **La caché se invalidó:** repetir el paso 3 → `MISS` y los bloques 10:00 y 11:00 aparecen `BUSY`.
6. **Traslape → 409:** repetir el paso 4 con `11:00` a `13:00` → `409 RESERVATION_OVERLAP`.
7. **Estudiante no reserva → 403:** iniciar sesión como `estudiante@reservalab.edu` y repetir el paso 4 con su token.
8. **Mockoon recibió las notificaciones:** `docker compose logs mockoon | grep notifications` muestra el
   `POST /notifications` con `reservation.confirmed` (y `reservation.cancelled` al cancelar).
9. **API keys (como admin):** crear una key solo con `read:spaces`, probarla en `/now` → `403`; revocarla
   (`DELETE /api-keys/:id`) y volver a usarla → `401`.
10. **Pantalla informativa:** `curl -si $API/now -H "X-API-Key: $KEY"`, y abrir http://localhost:5173/pantalla.html
    (se refresca cada 30 s, sin login).
11. **Rate limit → 429:** `for i in $(seq 1 65); do curl -s -o /dev/null -w '%{http_code} ' $API/now -H "X-API-Key: $KEY"; done`
    (los últimos responden `429` con `Retry-After`).
12. **Web:** http://localhost:5173 → login docente, elegir espacio y fecha, **Reservar** un bloque, intentar el mismo
    bloque desde otra pestaña para ver el mensaje del 409, **Cancelar** en "Mis reservas". El botón
    "Simular token vencido" demuestra la renovación automática con `/auth/refresh`.

## Integrantes

| Integrante | Aportes |
| ---------- | ------- |
| Keneth     |         |
| Jaime      |         |
| Adriana    |         |

## Uso de asistentes de IA

Se usó Claude (Anthropic) como asistente de programación para generar y revisar código, pruebas y documentación.
Todo el código fue revisado por el equipo.
