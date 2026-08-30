import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toastMutationError } from '@/lib/errors/toast';

export interface CreateBuildingInput {
  name: string;
  address?: string | null;
  administration_id: string;
}

export interface UpdateBuildingInput {
  id: string;
  name?: string;
  address?: string | null;
}

export interface DeactivateBuildingInput {
  id: string;
}

export function useMutateBuilding() {
  const queryClient = useQueryClient();

  const createBuilding = useMutation({
    mutationFn: async (input: CreateBuildingInput) => {
      const { data, error } = await supabase
        .from('buildings')
        .insert({
          name: input.name,
          address: input.address ?? null,
          administration_id: input.administration_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'buildings'] });
      toast.success('Edificio creado correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const updateBuilding = useMutation({
    mutationFn: async (input: UpdateBuildingInput) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from('buildings')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'buildings'] });
      toast.success('Edificio actualizado correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const deactivateBuilding = useMutation({
    mutationFn: async (input: DeactivateBuildingInput) => {
      const { data, error } = await supabase
        .from('buildings')
        .update({ status: 'inactive' })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'buildings'] });
      toast.success('Edificio desactivado correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  return { createBuilding, updateBuilding, deactivateBuilding };
}
