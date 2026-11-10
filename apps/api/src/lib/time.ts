/**
 * Utilidades de fecha para la zona horaria de la facultad (America/Guatemala).
 * Guatemala usa UTC-6 todo el año, sin horario de verano, así que el desfase es fijo.
 */
export const TZ_OFFSET = '-06:00';
const OFFSET_MS = 6 * 60 * 60 * 1000;

/** Convierte una fecha local (YYYY-MM-DD) y una hora local (HH:MM) a un instante UTC. */
export function localToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${TZ_OFFSET}`);
}

/** Fecha local YYYY-MM-DD de un instante. */
export function localDate(instant: Date): string {
  return new Date(instant.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Hora local HH:MM de un instante. */
export function localTime(instant: Date): string {
  return new Date(instant.getTime() - OFFSET_MS).toISOString().slice(11, 16);
}

/** true si la cadena YYYY-MM-DD corresponde a una fecha real del calendario (descarta 2026-02-31). */
export function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
