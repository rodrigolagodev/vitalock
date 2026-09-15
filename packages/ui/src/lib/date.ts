/**
 * Day-grouping helpers shared by `DataCardList` and any view grouping rows
 * by calendar day (es-AR). Moved and generalized from installer's local
 * `HistorialPage` copies so admin `HistorialTable`/`EquipmentUpdateHistoryPanel`
 * can share the exact same grouping semantics.
 */

/** `"2026-01-03T10:00:00.000Z"` → `"2026-01-03"` — stable sort/group key. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** `"2026-01-03"` → `"viernes, 3 de enero de 2026"` (es-AR long form). */
export function formatDayHeading(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** `"2026-01-03T10:00:00.000Z"` → `"2026-01"` — stable sort/group key. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * `"2026-01"` → `"enero de 2026"` (es-AR long form).
 *
 * Built from explicit local-time components (`new Date(y, m, d)`), not a
 * parsed `"2026-01-01"` string — the latter parses as UTC midnight, which
 * a negative-offset local timezone (e.g. America/Buenos_Aires) rolls back
 * into the *previous* day and, at a month boundary, the previous month —
 * the same class of bug `formatDayHeading` has for day headings, but here
 * it would silently show the wrong month on every single card.
 */
export function formatMonthHeading(isoMonth: string): string {
  const [year, month] = isoMonth.split('-').map(Number);
  const date = new Date(year!, month! - 1, 1);
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}
