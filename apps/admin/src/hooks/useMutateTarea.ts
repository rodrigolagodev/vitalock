import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toastMutationError } from '@/lib/errors/toast';

export interface CreateTareaInput {
  administration_id: string;
  building_id: string;
  category: 'maintain_equipment';
  description: string;
  unit_id?: string | null;
  equipment_id?: string | null;
  assigned_to_staff_id?: string | null;
  notes?: string | null;
}

export interface UpdateTareaInput {
  id: string;
  description?: string;
  status?: string;
  assigned_to_staff_id?: string | null;
  notes?: string | null;
  resolution_notes?: string | null;
  cancellation_reason?: string | null;
}

export const categoryLabels: Record<
  | 'install_equipment'
  | 'replace_equipment'
  | 'update_equipment'
  | 'maintain_equipment',
  string
> = {
  install_equipment: 'Instalación de equipo',
  replace_equipment: 'Cambio de equipo',
  update_equipment: 'Actualización de equipo',
  maintain_equipment: 'Mantenimiento',
};

export function useMutateTarea() {
  const queryClient = useQueryClient();

  const invalidateTareas = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tareas'] });
  };

  const createTarea = useMutation({
    mutationFn: async (input: CreateTareaInput) => {
      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .insert({
          administration_id: input.administration_id,
          building_id: input.building_id,
          category: input.category,
          description: input.description,
          unit_id: input.unit_id ?? null,
          equipment_id: input.equipment_id ?? null,
          assigned_to_staff_id: input.assigned_to_staff_id ?? null,
          notes: input.notes ?? null,
          status: 'open',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateTareas();
      toast.success('Tarea creada correctamente.');
    },
    onError: toastMutationError,
  });

  const updateTarea = useMutation({
    mutationFn: async (input: UpdateTareaInput) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .schema('support')
        .from('tickets')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateTareas();
      toast.success('Tarea actualizada correctamente.');
    },
    onError: toastMutationError,
  });

  return { createTarea, updateTarea };
}
