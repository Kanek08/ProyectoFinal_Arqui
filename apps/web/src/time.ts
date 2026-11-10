import { TIMEZONE } from '@reservalab/shared';

/** Fecha de hoy en Guatemala como YYYY-MM-DD (en-CA usa ese formato). */
export function todayInGuatemala(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-GT', { timeZone: TIMEZONE, hour12: false, ...options });

const timeOnly = fmt({ hour: '2-digit', minute: '2-digit' });
const dayNumber = fmt({ day: 'numeric' });
const monthShort = fmt({ month: 'short' });
const weekdayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const clock = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' });
const clockShort = fmt({ hour: '2-digit', minute: '2-digit' });

/** "08:00 – 10:00" en hora de Guatemala. */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${timeOnly.format(new Date(startIso))} – ${timeOnly.format(new Date(endIso))}`;
}

/** Día y mes cortos para la insignia de fecha: { day: "10", month: "nov" }. */
export function dateParts(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return { day: dayNumber.format(d), month: monthShort.format(d).replace('.', '') };
}

/** "martes, 10 de noviembre". */
export function formatLongDate(date: Date | string): string {
  const text = weekdayLong.format(typeof date === 'string' ? new Date(`${date}T12:00:00-06:00`) : date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatClock(date: Date, withSeconds = true): string {
  return (withSeconds ? clock : clockShort).format(date);
}
