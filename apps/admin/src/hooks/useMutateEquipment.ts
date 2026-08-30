import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { equipmentKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

export interface CreateEquipmentInput {
  building_id: string;
  serial_number: string;
  model: string;
  installed_at: string;
  // replaces_equipment_id is intentionally absent — only set via RPC
}

export interface UpdateEquipmentInput {
  id: string;
  model?: string;
  // Immutable fields NOT included: serial_number, building_id, installed_at, replaces_equipment_id
}

export interface UpdateStatusInput {
  id: string;
  status: 'active' | 'maintenance' | 'dead';
  decommission_reason?: string;
}

export function useMutateEquipment(buildingId: string) {
  const queryClient = useQueryClient();

  const createEquipment = useMutation({
    mutationFn: async (input: CreateEquipmentInput) => {
      // Destructure explicitly to guarantee immutable fields (replaces_equipment_id) never slip in
      const { building_id, serial_number, model, installed_at } = input;
      const { data, error } = await supabase
        .schema('operations')
        .from('equipment')
        .insert({ building_id, serial_number, model, installed_at, description: '' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
      toast.success('Equipo creado correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const updateEquipment = useMutation({
    mutationFn: async (input: UpdateEquipmentInput) => {
      const { id, ...rest } = input;
      // rest contains only mutable fields (model, etc.)
      // Immutable fields serial_number/building_id/installed_at/replaces_equipment_id
      // are excluded by the UpdateEquipmentInput type and never present in rest.
      const { data, error } = await supabase
        .schema('operations')
        .from('equipment')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
      toast.success('Equipo actualizado correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: UpdateStatusInput) => {
      const { id, status, decommission_reason } = input;
      const payload: Record<string, unknown> = { status };
      if (decommission_reason !== undefined) {
        payload.decommission_reason = decommission_reason;
      }
      const { data, error } = await supabase
        .schema('operations')
        .from('equipment')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
      toast.success('Estado del equipo actualizado.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  return { createEquipment, updateEquipment, updateStatus };
}
