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
