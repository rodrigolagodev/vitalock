import type { QueryObserverResult, RefetchOptions, UseQueryResult } from '@tanstack/react-query';
import type { CappedList } from '../db/listCap';

/** `Omit` that keeps the discriminated union of query states intact. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface CappedFields {
  /** Exact server-side total for the current filters; undefined until loaded. */
  total: number | undefined;
  /** True when the list shows only the first `LIST_ROW_CAP` rows. */
  truncated: boolean;
}

/**
 * A list query result that keeps the plain `data: TRow[]` shape consumers
 * already rely on, plus truncation metadata alongside it. `refetch` resolves
 * to the same adapted shape; the experimental `promise` field is dropped.
 */
export type CappedQueryResult<TRow> = DistributiveOmit<
  UseQueryResult<TRow[]>,
  'refetch' | 'promise'
> &
  CappedFields & {
    refetch: (options?: RefetchOptions) => Promise<CappedQueryResult<TRow>>;
  };

/**
 * Adapts a query whose data is a `CappedList` back to the `data: TRow[]`
 * shape, exposing `total` / `truncated` as sibling fields.
 */
export function toCappedQueryResult<TRow>(
  result: UseQueryResult<CappedList<TRow>> | QueryObserverResult<CappedList<TRow>>,
): CappedQueryResult<TRow> {
  const { refetch, promise: _promise, ...rest } = result;
  return {
    ...rest,
    data: result.data?.rows,
    total: result.data?.total,
    truncated: result.data?.truncated ?? false,
    refetch: async (options?: RefetchOptions) => toCappedQueryResult(await refetch(options)),
  } as unknown as CappedQueryResult<TRow>;
}
