import { format } from 'date-fns';

/** IBP's time zone, used until (or unless) the backend reports its own. */
export const DEFAULT_TIME_ZONE = 'America/Chicago';

/** Return `timeZone` if the browser knows it, else the default zone. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * Today's date (`yyyy-MM-dd`) in `timeZone`, whatever the browser's own zone.
 * (`toISOString()` would give the UTC date, a day ahead on US evenings.)
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Today in `timeZone` as a local-midnight Date, the form the calendar uses for
 * its days.
 */
export function todayDateInTimeZone(timeZone: string, now: Date = new Date()): Date {
  const [year, month, day] = todayInTimeZone(timeZone, now).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Whether a calendar date (read in the browser's zone) is after today in `timeZone`. */
export function isAfterToday(date: Date, timeZone: string, now: Date = new Date()): boolean {
  return format(date, 'yyyy-MM-dd') > todayInTimeZone(timeZone, now);
}
