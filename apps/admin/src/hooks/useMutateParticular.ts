import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { particularesKey, particularKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface CreateParticularInput {
  unit_id?: string | null;
  dni: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
}

export interface UpdateParticularInput {
  id: string;
  unit_id?: string;
  dni?: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
}

export interface DeactivateParticularInput {
  id: string;
}

// Same shape useParticulares returns — needed so callers that bind the row
// (e.g. the order form) can prefill from the unit embed without a second fetch.
const PARTICULAR_SELECT_WITH_UNIT =
  'id, unit_id, dni, full_name, phone, email, ' +
  'units!particulares_unit_id_fkey(number, building_id, buildings!units_building_id_fkey(name))';

type ParticularRowWithUnit = {
  id: string;
  unit_id: string | null;
  dni: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  units?: {
    number: string | null;
    building_id: string | null;
    buildings: { name: string | null } | null;
  } | null;
};

function flattenParticular(row: ParticularRowWithUnit) {
  const { units, ...rest } = row;
  return {
    ...rest,
    unit_number: units?.number ?? null,
    building_name: units?.buildings?.name ?? null,
    unit_building_id: units?.building_id ?? null,
  };
}

/**
 * Particulares mutations (create/update/soft-delete). Unit binding is 1:1
 * (unit_id UNIQUE), so duplicate DNI/unit attempts surface as SQLSTATE
 * 23505. Soft-delete follows the staff/units/administrations convention:
 * deactivateParticular flips status to 'inactive' instead of deleting.
 */
export function useMutateParticular() {
  const queryClient = useQueryClient();

  const invalidateParticulares = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: particularesKey() });
    if (id) {
      void queryClient.invalidateQueries({ queryKey: particularKey(id) });
    }
  };

  const createParticular = useMutation({
    mutationFn: async (input: CreateParticularInput) => {
      const { data, error } = await supabase
        .from('particulares')
        .insert(input)
        .select(PARTICULAR_SELECT_WITH_UNIT)
        .single();
      if (error) throw error;
      return flattenParticular(data as unknown as ParticularRowWithUnit);
    },
    onSuccess: () => {
      invalidateParticulares();
      toast.success('Particular creado correctamente.');
    },
    onError: toastMutationError,
  });

  const updateParticular = useMutation({
    mutationFn: async (input: UpdateParticularInput) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from('particulares')
        .update(rest)
        .eq('id', id)
        .select(PARTICULAR_SELECT_WITH_UNIT)
        .single();
      if (error) throw error;
      return flattenParticular(data as unknown as ParticularRowWithUnit);
    },
    onSuccess: (_data, input) => {
      invalidateParticulares(input.id);
      toast.success('Particular actualizado correctamente.');
    },
    onError: toastMutationError,
  });

  const deactivateParticular = useMutation({
    mutationFn: async (input: DeactivateParticularInput) => {
      const { data, error } = await supabase
        .from('particulares')
        .update({ status: 'inactive' })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => {
      invalidateParticulares(input.id);
      toast.success('Particular dado de baja correctamente.');
    },
    onError: toastMutationError,
  });

  return { createParticular, updateParticular, deactivateParticular };
}
