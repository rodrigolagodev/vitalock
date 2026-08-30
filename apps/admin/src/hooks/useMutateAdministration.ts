import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toastMutationError } from '@/lib/errors/toast';

export interface CreateAdministrationInput {
  company_name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateAdministrationInput {
  id: string;
  company_name?: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface DeactivateAdministrationInput {
  id: string;
}

export function useMutateAdministration() {
  const queryClient = useQueryClient();

  const createAdministration = useMutation({
    mutationFn: async (input: CreateAdministrationInput) => {
      const { data, error } = await supabase
        .from('administrations')
        .insert({
          company_name: input.company_name,
          tax_id: input.tax_id ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'administrations'] });
      toast.success('Administración creada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const updateAdministration = useMutation({
    mutationFn: async (input: UpdateAdministrationInput) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from('administrations')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'administrations'] });
      toast.success('Administración actualizada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const deactivateAdministration = useMutation({
    mutationFn: async (input: DeactivateAdministrationInput) => {
      const { data, error } = await supabase
        .from('administrations')
        .update({ status: 'inactive' })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'administrations'] });
      toast.success('Administración desactivada correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  return { createAdministration, updateAdministration, deactivateAdministration };
}
