import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { staffKey } from '@/lib/queryKeys';

export interface StaffOption {
  id: string;
  full_name: string;
  role: string;
}

export function useStaff() {
  return useQuery({
    queryKey: staffKey(),
    queryFn: async (): Promise<StaffOption[]> => {
      const { data, error } = await supabase
        .schema('identity')
        .from('staff')
        .select('id, full_name, role, status')
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;

      return (data ?? []).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        role: s.role,
      }));
    },
  });
}
