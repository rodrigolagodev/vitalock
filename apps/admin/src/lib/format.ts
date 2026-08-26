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
