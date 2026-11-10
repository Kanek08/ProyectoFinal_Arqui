import { TIMEZONE } from '@reservalab/shared';

/** Fecha de hoy en Guatemala como YYYY-MM-DD (en-CA usa ese formato). */
export function todayInGuatemala(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

const dateTime = new Intl.DateTimeFormat('es-GT', {
  timeZone: TIMEZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const timeOnly = new Intl.DateTimeFormat('es-GT', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "lun, 10 nov, 08:00 a 10:00" en hora de Guatemala. */
export function formatRange(startIso: string, endIso: string): string {
  return `${dateTime.format(new Date(startIso))} a ${timeOnly.format(new Date(endIso))}`;
}

export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
