import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { escapeIlikeValue } from '../db/escapeIlikeValue';
import { fetchCappedList, type CappableQuery, type CappedList } from '../db/listCap';
import { toCappedQueryResult, type CappedQueryResult } from '../query/cappedQueryResult';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrderListFilters<TStatus extends string> {
  search?: string;
  /** Zero-or-more statuses filtered by set-membership. Empty/undefined = no filter. */
  status?: TStatus[];
  administrationId?: string;
  buildingId?: string;
}

/**
 * Raw shape of a row returned by an order summary view.
 * The items array lives under the key matching `itemsTable`.
 */
export interface OrderListSummaryRawRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  company_name: string | null;
  particular_full_name: string | null;
  status: string;
  created_at: string;
  /** Server-computed order total (whole order, excludes cancelled items). */
  total_amount: number | string | null;
  [itemsField: string]: unknown;
}

/**
 * Exactly the filter-builder surface this factory chains. Declared minimal so
 * the real `TypedSupabaseClient` satisfies it structurally and tests can hand
 * in a plain object — without an `any` in the middle.
 */
export interface OrderListQuery {
  eq: (column: string, value: string) => OrderListQuery;
  in: (column: string, values: string[]) => OrderListQuery;
  or: (filters: string) => OrderListQuery;
  order: (column: string, options: { ascending: boolean }) => CappableQuery;
}

/** Minimal supabase client surface the factory needs. */
export interface OrderListSupabaseClient {
  from: (view: string) => {
    select: (cols: string, options: { count: 'exact' }) => OrderListQuery;
  };
}

export interface CreateUseOrderListOptions<TRow> {
  /** View name in the public schema (e.g. 'key_orders_summary'). */
  view: string;
  /** Items table name used for embed + building filter (e.g. 'key_order_items'). */
  itemsTable: string;
  /**
   * Supabase client instance — injected by the app so the factory stays
   * testable without module-level mock setup.
   */
  supabase: OrderListSupabaseClient;
  /**
   * Query-key factory. MUST be the exact same reference imported by mutation
   * hooks so invalidation and list caching share one key shape.
   */
  queryKeyFn: (
    status?: string[],
    search?: string,
    administrationId?: string,
    buildingId?: string,
  ) => readonly unknown[];
  /** Maps the raw summary row (with typed items array) to the domain row. */
  mapRow: (row: OrderListSummaryRawRow, itemsField: string) => TRow;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `useOrderList` hook bound to a specific order view and items table.
 *
 * ADR-3: Factory over discriminator — return type stays exactly typed per app;
 * status unions differ across consumers.
 * ADR-4: `queryKeyFn` is passed by reference so mutation hooks and list hooks
 * share the exact same key factory — invalidation drift is impossible.
 */
export function createUseOrderList<TStatus extends string, TRow>(
  options: CreateUseOrderListOptions<TRow>,
): (filters?: OrderListFilters<TStatus>) => CappedQueryResult<TRow> {
  const { view, itemsTable, supabase, queryKeyFn, mapRow } = options;

  return function useOrderList(filters?: OrderListFilters<TStatus>): CappedQueryResult<TRow> {
    const { search, status, administrationId, buildingId } = filters ?? {};
    const trimmed = search?.trim() ?? '';
    const scopedByBuilding = Boolean(buildingId && buildingId !== 'all');

    const result: UseQueryResult<CappedList<TRow>> = useQuery({
      queryKey: queryKeyFn(status, trimmed, administrationId, buildingId),
      queryFn: async (): Promise<CappedList<TRow>> => {
        const embed = scopedByBuilding
          ? `${itemsTable}!inner(id,building_id)`
          : `${itemsTable}(id)`;

        // `count: 'exact'` respects the `!inner` embed, so the total stays
        // scoped to the building filter.
        let query: OrderListQuery = supabase
          .from(view)
          .select(
            `id, order_number, client_type, administration_id, company_name, particular_full_name, status, created_at, total_amount, ${embed}`,
            { count: 'exact' },
          );

        if (status?.length) {
          query = query.in('status', status);
        }

        if (administrationId && administrationId !== 'all') {
          query = query.eq('administration_id', administrationId);
        }

        if (scopedByBuilding) {
          query = query.eq(`${itemsTable}.building_id`, buildingId!);
        }

        if (trimmed) {
          const safe = escapeIlikeValue(trimmed);
          query = query.or(
            `order_number.ilike.%${safe}%,particular_full_name.ilike.%${safe}%,company_name.ilike.%${safe}%`,
          );
        }

        const capped = await fetchCappedList<OrderListSummaryRawRow>(
          query.order('created_at', { ascending: false }),
        );
        return { ...capped, rows: capped.rows.map((row) => mapRow(row, itemsTable)) };
      },
    });
    return toCappedQueryResult(result);
  };
}
