import type { KstDay } from '@zuirock/shared';

/** KstDay ↔ Prisma `@db.Date` value (a UTC-midnight Date carrying the calendar day). */
export function dayToDate(day: KstDay): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function dateToDay(date: Date): KstDay {
  return date.toISOString().slice(0, 10);
}
