import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { unitsKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';
import type { UnitRow } from './useUnits';

export interface CreateUnitInput {
  building_id: string;
  number: string;
  unit_type?: string | null;
  is_administrative?: boolean;
}

export interface UpdateUnitInput {
  id: string;
  number?: string;
  is_administrative?: boolean;
}

export interface DeactivateUnitInput {
  id: string;
  building_id: string;
}

export function useMutateUnit(buildingId: string) {
  const queryClient = useQueryClient();

  const createUnit = useMutation({
    mutationFn: async (input: CreateUnitInput) => {
      const { data, error } = await supabase
        .from('units')
        .insert({
          building_id: input.building_id,
          number: input.number,
          unit_type: input.unit_type ?? null,
          is_administrative: input.is_administrative ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Prime the cache synchronously so consumers (e.g. a <Select> that binds
      // the new unit id immediately after creation) can render the new option
      // before the invalidation refetch lands.
      const created = data as UnitRow;
      queryClient.setQueryData<UnitRow[]>(unitsKey(buildingId), (prev = []) =>
        [...prev, created].sort((a, b) => a.number.localeCompare(b.number)),
      );
      queryClient.invalidateQueries({ queryKey: unitsKey(buildingId) });
      toast.success('Unidad creada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const updateUnit = useMutation({
    mutationFn: async (input: UpdateUnitInput) => {
      const { id, ...rest } = input;
      // building_id is NOT sent in updateUnit payload (immutable per spec)
      const { data, error } = await supabase
        .from('units')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unitsKey(buildingId) });
      toast.success('Unidad actualizada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const deactivateUnit = useMutation({
    mutationFn: async (input: DeactivateUnitInput) => {
      const { data, error } = await supabase
        .from('units')
        .update({ status: 'inactive' })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unitsKey(buildingId) });
      toast.success('Unidad desactivada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  return { createUnit, updateUnit, deactivateUnit };
}
