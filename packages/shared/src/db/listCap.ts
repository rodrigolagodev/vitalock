/**
 * Safety net against silent list truncation.
 *
 * PostgREST caps every response at `max_rows` (supabase/config.toml = 1000).
 * Without an explicit limit + count, a list that grows past that cap is cut
 * off silently and the UI shows a partial list as if it were complete.
 *
 * Until server-side pagination lands, growing lists fetch at most
 * `LIST_ROW_CAP` rows with `{ count: 'exact' }` so the UI can tell the user
 * when what it shows is only the first slice.
 */
export const LIST_ROW_CAP = 1000;

export interface CappedList<TRow> {
  /** The rows actually returned (at most `cap`). */
  rows: TRow[];
  /** Exact number of rows matching the query's filters, server-side. */
  total: number;
  /** True when `total` exceeds the rows returned. */
  truncated: boolean;
}

/**
 * Minimal builder surface needed to cap a query. The real PostgREST filter
 * builder satisfies it structurally, and tests can hand in a plain object.
 */
export interface CappableQuery {
  limit: (count: number) => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>;
}

/**
 * Runs a list query capped at `cap` rows and reports whether it was truncated.
 *
 * The query MUST be built with `.select(columns, { count: 'exact' })` so the
 * response carries the real total. If the count is missing, the helper falls
 * back to treating a full page (`rows.length >= cap`) as truncated, so a
 * forgotten count still never truncates silently.
 */
export async function fetchCappedList<TRow>(
  query: CappableQuery,
  cap: number = LIST_ROW_CAP,
): Promise<CappedList<TRow>> {
  const { data, error, count } = await query.limit(cap);
  if (error) throw error;

  const rows = (data ?? []) as TRow[];
  if (typeof count === 'number') {
    return { rows, total: count, truncated: count > rows.length };
  }
  return { rows, total: rows.length, truncated: rows.length >= cap };
}
