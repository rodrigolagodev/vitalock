import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { personalKey } from '@/lib/queryKeys';

export interface StaffRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'installer';
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
}

export interface UsePersonalFilters {
  search?: string;
  role?: 'admin' | 'installer';
}

export function usePersonal({ search, role }: UsePersonalFilters = {}) {
  const trimmed = search?.trim() ?? '';

  return useQuery({
    queryKey: personalKey(trimmed, role),
    queryFn: async (): Promise<StaffRow[]> => {
      // PostgREST cannot run ilike on a uuid column (no ~~* operator for uuid
      // and casting a column inside a horizontal filter is not allowed), so the
      // text search (including the staff id) is applied entirely client-side.
      // Staff lists are small and unpaginated, so this is consistent with the
      // repo pattern (useTareas resolves building/staff names client-side too).
      let query = supabase
        .schema('identity')
        .from('staff')
        .select('id, full_name, email, phone, role, status, notes, created_at')
        .eq('status', 'active');

      if (role) {
        query = query.eq('role', role);
      }

      const { data, error } = await query.order('full_name');
      if (error) throw error;

      let rows = (data ?? []) as unknown as StaffRow[];

      if (trimmed) {
        const q = trimmed.toLowerCase();
        rows = rows.filter(
          (row) =>
            row.id.toLowerCase().includes(q) ||
            row.full_name.toLowerCase().includes(q) ||
            (row.email?.toLowerCase().includes(q) ?? false),
        );
      }

      return rows;
    },
  });
}
