import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { escapeIlikeValue } from '../db/escapeIlikeValue';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrderListFilters<TStatus extends string> {
  search?: string;
  status?: TStatus | 'all' | (string & {});
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
  [itemsField: string]: unknown;
}

/** Minimal supabase client surface the factory needs. */
export interface OrderListSupabaseClient {
  from: (view: string) => {
    select: (cols: string) => unknown;
  };
}

// TStatus is part of the public factory API (documents allowed status values
// for consumers); intentionally unused inside this file's implementation.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface CreateUseOrderListOptions<TStatus extends string, TRow> {
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
    status?: string,
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
  options: CreateUseOrderListOptions<TStatus, TRow>,
): (filters?: OrderListFilters<TStatus>) => UseQueryResult<TRow[]> {
  const { view, itemsTable, supabase, queryKeyFn, mapRow } = options;

  return function useOrderList(filters?: OrderListFilters<TStatus>): UseQueryResult<TRow[]> {
    const { search, status, administrationId, buildingId } = filters ?? {};
    const trimmed = search?.trim() ?? '';
    const scopedByBuilding = Boolean(buildingId && buildingId !== 'all');

    return useQuery({
      queryKey: queryKeyFn(status, trimmed, administrationId, buildingId),
      queryFn: async (): Promise<TRow[]> => {
        const embed = scopedByBuilding
          ? `${itemsTable}!inner(id,building_id)`
          : `${itemsTable}(id)`;

        // Build query chain — typed as unknown to allow chained method calls
        // without fighting the minimal client interface type.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = (supabase as any)
          .from(view)
          .select(
            `id, order_number, client_type, administration_id, company_name, particular_full_name, status, created_at, ${embed}`,
          );

        if (status && status !== 'all') {
          query = query.eq('status', status);
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

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const rows = (data ?? []) as unknown as OrderListSummaryRawRow[];
        return rows.map((row) => mapRow(row, itemsTable));
      },
    });
  };
}
