import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AdministrationRow {
  id: string;
  company_name: string;
  status: string;
}

export const administrationsKey = () => ['admin', 'administrations'] as const;

export function useAdministrations() {
  return useQuery({
    queryKey: administrationsKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('administrations')
        .select('id, company_name, status')
        .eq('status', 'active')
        .order('company_name');
      if (error) throw error;
      return (data ?? []) as AdministrationRow[];
    },
  });
}
