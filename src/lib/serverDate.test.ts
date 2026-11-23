import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  isAfterToday,
  resolveTimeZone,
  todayDateInTimeZone,
  todayInTimeZone,
} from './serverDate';

// 9:30 pm in Chicago (CST, UTC-6) on 2026-01-15, already 2026-01-16 in UTC.
const CHICAGO_EVENING = new Date('2026-01-16T03:30:00Z');

describe('todayInTimeZone', () => {
  it("gives the zone's date, not the UTC one", () => {
    expect(todayInTimeZone('America/Chicago', CHICAGO_EVENING)).toBe('2026-01-15');
    expect(todayInTimeZone('UTC', CHICAGO_EVENING)).toBe('2026-01-16');
    expect(todayInTimeZone('Asia/Tokyo', CHICAGO_EVENING)).toBe('2026-01-16');
    expect(todayInTimeZone('Pacific/Honolulu', CHICAGO_EVENING)).toBe('2026-01-15');
  });
});

describe('todayDateInTimeZone', () => {
  it("is local midnight on the zone's date", () => {
    const today = todayDateInTimeZone('America/Chicago', CHICAGO_EVENING);
    expect([today.getFullYear(), today.getMonth(), today.getDate()]).toEqual([2026, 0, 15]);
    expect([today.getHours(), today.getMinutes()]).toEqual([0, 0]);
  });
});

describe('isAfterToday', () => {
  it("compares a calendar date with the zone's today", () => {
    const jan15 = new Date(2026, 0, 15);
    const jan16 = new Date(2026, 0, 16);
    expect(isAfterToday(jan15, 'America/Chicago', CHICAGO_EVENING)).toBe(false);
    expect(isAfterToday(jan16, 'America/Chicago', CHICAGO_EVENING)).toBe(true);
    expect(isAfterToday(jan16, 'Asia/Tokyo', CHICAGO_EVENING)).toBe(false);
  });
});

describe('resolveTimeZone', () => {
  it('keeps a zone the browser knows', () => {
    expect(resolveTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it.each([undefined, null, '', 'Nowhere/Land'])('falls back to Chicago for %s', (zone) => {
    expect(resolveTimeZone(zone)).toBe(DEFAULT_TIME_ZONE);
    expect(DEFAULT_TIME_ZONE).toBe('America/Chicago');
  });
});
