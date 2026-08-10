import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { particularesKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface CreateParticularInput {
  unit_id: string;
  dni: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
}

/**
 * Particulares mutations. Only createParticular exists this cycle —
 * entity editing is out of scope. Unit binding is 1:1 (unit_id UNIQUE),
 * so duplicate DNI/unit attempts surface as SQLSTATE 23505.
 */
export function useMutateParticular() {
  const queryClient = useQueryClient();

  const createParticular = useMutation({
    mutationFn: async (input: CreateParticularInput) => {
      const { data, error } = await supabase
        .from('particulares')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: particularesKey() });
      toast.success('Particular creado correctamente.');
    },
    onError: toastMutationError,
  });

  return { createParticular };
}
