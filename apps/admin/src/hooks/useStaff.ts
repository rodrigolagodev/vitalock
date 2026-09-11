import { usePersonal } from './usePersonal';
import type { StaffRow } from './usePersonal';

/** The subset most pickers need. `usePersonal` rows satisfy it structurally. */
export type StaffOption = Pick<StaffRow, 'id' | 'full_name' | 'role'>;

/**
 * Active staff for assignment pickers. Delegates to `usePersonal()` so both
 * surfaces share one cache entry (`personalKey`) — they used to be two hooks
 * over the same table with two keys, forcing every staff mutation to
 * invalidate both.
 */
export function useStaff() {
  return usePersonal();
}
