import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { administrationKey } from '@/lib/queryKeys';

export interface AdministrationDetailRow {
  id: string;
  company_name: string;
  tax_id: string | null;
  address: string | null;
  status: string;
}

export function useAdministration(id: string) {
  return useQuery({
    queryKey: administrationKey(id),
    queryFn: async (): Promise<AdministrationDetailRow | null> => {
      const { data, error } = await supabase
        .from('administrations')
        .select('id, company_name, tax_id, address, status')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
    enabled: Boolean(id),
  });
}
