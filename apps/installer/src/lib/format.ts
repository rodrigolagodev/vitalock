/**
 * Formats an ISO timestamp as `dd/MM/yy HH:mm` in Argentine locale. Returns
 * "—" for null/undefined and echoes the raw value when it is not a date so a
 * malformed row never renders "Invalid Date".
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}
