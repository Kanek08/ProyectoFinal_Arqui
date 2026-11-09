-- Regla de negocio principal protegida en la base de datos:
-- un espacio no puede tener dos reservas CONFIRMED que se traslapen.
-- Aunque la capa de servicios valide antes, esta restricción garantiza la regla
-- incluso si dos solicitudes concurrentes pasan la validación al mismo tiempo.

-- btree_gist permite combinar igualdad (space_id WITH =) con rangos (&&) en un índice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- El fin siempre debe ser posterior al inicio.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_end_after_start" CHECK ("end_at" > "start_at");

-- Rango semiabierto [inicio, fin): una reserva de 08:00-10:00 y otra de 10:00-12:00 NO se traslapan.
-- Las reservas canceladas quedan fuera de la restricción, así el horario se libera.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "space_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
