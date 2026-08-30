const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a number as Argentine pesos (`$1.500,00`). Returns "—" for
 * null/undefined to keep table cells visually consistent.
 */
export function formatCurrencyARS(value: number | null | undefined): string {
  if (value == null) return '—';
  return currencyFormatter.format(value);
}

/**
 * Alias of `formatCurrencyARS` so call sites that only care about the
 * currency semantics can use a shorter name without duplicating logic.
 */
export function formatCurrency(value: number | null | undefined): string {
  return formatCurrencyARS(value);
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a date as `dd/MM/yyyy` in Argentine locale. Returns "—" for
 * null/undefined or invalid dates to keep table cells visually consistent.
 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formats a date + time (`fecha corta + hora`) in Argentine locale. Returns
 * "—" for null/undefined or invalid dates to keep table cells consistent.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}
