import { describe, expect, it } from 'vitest';
import { formatMonthHeading, monthKey } from '../date';

describe('monthKey', () => {
  it('extracts the year-month prefix from an ISO timestamp', () => {
    expect(monthKey('2026-08-25T15:00:00.000Z')).toBe('2026-08');
  });
});

describe('formatMonthHeading', () => {
  it('formats a year-month key as an es-AR long month heading', () => {
    expect(formatMonthHeading('2026-08')).toMatch(/agosto/i);
    expect(formatMonthHeading('2026-08')).toMatch(/2026/);
  });

  it('never rolls back to the previous month at the day-1 boundary (local-time construction, not UTC-string parsing)', () => {
    // A naive `new Date("2026-07-01")` parses as UTC midnight, which a
    // negative-offset local timezone (e.g. America/Buenos_Aires, UTC-3)
    // rolls back to June 30 local — silently showing "junio" instead of
    // "julio". `formatMonthHeading` must build the date from explicit
    // local-time components instead, so this holds regardless of the
    // machine's timezone.
    expect(formatMonthHeading('2026-07')).toMatch(/julio/i);
    expect(formatMonthHeading('2026-01')).toMatch(/enero/i);
  });
});
