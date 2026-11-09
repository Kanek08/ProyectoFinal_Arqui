# ReservaLab

API REST en TypeScript para reservar laboratorios y salones de la Facultad de Ingeniería, sin reservas traslapadas.
Proyecto de curso de Arquitectura de Sistemas I

## Levantar el sistema 

cp .env.example .env
docker compose up --build


| Servicio                 | URL                                 |
| API                      | http://localhost:3000/api/v1        |
| Health                   | http://localhost:3000/api/v1/health |
| Web                      | http://localhost:5173               |
| Mockoon (notificaciones) | http://localhost:3001               |
| PostgreSQL / Redis       | localhost:5432 / localhost:6379     |


> En el .env poner POSTGRES_PORT=5433 y cambiar 5432 por 5433 en DATABASE_UR` y DATABASE_URL_TEST

docker compose down -v para borrar


## Usuarios de prueba 

| Rol           | Correo                    | Contraseña     |
| Administrador | admin@reservalab.edu      | `Password123!` |
| Docente       | docente@reservalab.edu    | `Password123!` |
| Estudiante    | estudiante@reservalab.edu | `Password123!` |



## Endpoints implementados


| Código        | Endpoint                                   | Acceso                  | Estado |
| RF-01         | `POST /auth/register`                      | Público                 | ✅     |
| RF-02         | `POST /auth/login`                         | Público                 | ✅     |
| RF-03         | `POST /auth/refresh`                       | Refresh token           | ✅     |
| RF-04         | `POST /auth/logout`                        | JWT                     | ✅     |
| RF-05         | `GET /spaces?building=&minCapacity=`       | JWT (API key en fase 2) | ✅     |
| RF-06         | `POST/PATCH/DELETE /spaces/:id`            | JWT, ADMIN              | ✅     |
| RF-13         | `GET /health`                              | Público                 | ✅     |


## Integrantes

| Integrante  | 
| Keneth | 
| Jaime | 
| Adriana | 
