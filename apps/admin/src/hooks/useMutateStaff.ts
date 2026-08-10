import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toastMutationError } from './mapMutationError';

export type StaffRole = 'admin' | 'installer';

export interface CreateStaffInput {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role: StaffRole;
  notes?: string | null;
}

export interface UpdateStaffInput {
  id: string;
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  role?: StaffRole;
  notes?: string | null;
}

export interface DeactivateStaffInput {
  id: string;
}

export function useMutateStaff() {
  const queryClient = useQueryClient();

  const invalidateStaff = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'personal'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
  };

  const createStaff = useMutation({
    mutationFn: async (input: CreateStaffInput) => {
      const { data, error } = await supabase
        .schema('identity')
        .from('staff')
        .insert({
          full_name: input.full_name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          role: input.role,
          notes: input.notes ?? null,
          status: 'active',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateStaff();
      toast.success('Personal creado correctamente.');
    },
    onError: toastMutationError,
  });

  const updateStaff = useMutation({
    mutationFn: async (input: UpdateStaffInput) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .schema('identity')
        .from('staff')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateStaff();
      toast.success('Personal actualizado correctamente.');
    },
    onError: toastMutationError,
  });

  const deactivateStaff = useMutation({
    mutationFn: async (input: DeactivateStaffInput) => {
      const { data, error } = await supabase
        .schema('identity')
        .from('staff')
        .update({ status: 'inactive' })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateStaff();
      toast.success('Personal dado de baja correctamente.');
    },
    onError: toastMutationError,
  });

  return { createStaff, updateStaff, deactivateStaff };
}
