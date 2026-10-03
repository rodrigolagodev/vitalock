export interface PricedLine {
  quantity?: number | string | null;
  unit_price?: number | string | null;
  status?: string | null;
}

const CANCELLED_STATUS = 'cancelled';

function toCents(value: PricedLine['unit_price'] | undefined): number {
  return Math.round((Number(value) || 0) * 100);
}

function lineCents(line: PricedLine): number {
  return toCents(line.unit_price) * (Number(line.quantity) || 0);
}

/** Line subtotal in pesos (quantity x unit price). Ignores status. */
export function lineSubtotal(line: PricedLine): number {
  return lineCents(line) / 100;
}

/**
 * Order total in pesos: sum of line subtotals over non-cancelled lines.
 * Mirrors the server `total_amount` (status <> 'cancelled'); summed as integer
 * cents and divided once so there is no floating-point drift.
 */
export function orderTotal(lines: readonly PricedLine[]): number {
  const cents = lines.reduce(
    (sum, line) => (line.status === CANCELLED_STATUS ? sum : sum + lineCents(line)),
    0,
  );
  return cents / 100;
}
