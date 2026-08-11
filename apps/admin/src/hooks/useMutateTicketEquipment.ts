import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { equipmentKey, tareasKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface AssignExistingEquipmentInput {
  ticketId: string;
  equipmentId: string;
}

export interface CreateAndAssignEquipmentInput {
  ticketId: string;
  buildingId: string;
  serial_number: string;
  model: string;
  description?: string | null;
  access_type: string;
}

export interface ReplaceEquipmentInTicketInput {
  ticketId: string;
  buildingId: string;
  old_equipment_id: string;
  new_serial_number: string;
  new_model: string;
  new_description?: string;
}

/**
 * Ticket ↔ equipment assignment for technical tickets.
 *   - assignExistingEquipment:  maintenance → link an equipment already
 *     living in the building to the ticket.
 *   - createAndAssignEquipment: installation / equipment_installation →
 *     create the equipment row and link it to the ticket in one flow.
 *   - replaceEquipmentInTicket: equipment_replacement → run the
 *     operations.replace_equipment RPC and link the newly-created device
 *     to the ticket.
 */
export function useMutateTicketEquipment(buildingId: string | null | undefined) {
  const queryClient = useQueryClient();

  const invalidate = (ticketId: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tarea', ticketId] });
    queryClient.invalidateQueries({ queryKey: tareasKey() });
    if (buildingId) {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
    }
  };

  const assignExistingEquipment = useMutation({
    mutationFn: async (input: AssignExistingEquipmentInput) => {
      const { error } = await supabase
        .schema('support')
        .from('tickets')
        .update({ equipment_id: input.equipmentId })
        .eq('id', input.ticketId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.ticketId);
      toast.success('Equipo asignado a la tarea.');
    },
    onError: toastMutationError,
  });

  const createAndAssignEquipment = useMutation({
    mutationFn: async (input: CreateAndAssignEquipmentInput) => {
      const { data: created, error: insertErr } = await supabase
        .schema('operations')
        .from('equipment')
        .insert({
          building_id: input.buildingId,
          serial_number: input.serial_number,
          model: input.model,
          description: input.description ?? '',
          access_type: input.access_type,
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      const { error: linkErr } = await supabase
        .schema('support')
        .from('tickets')
        .update({ equipment_id: created.id })
        .eq('id', input.ticketId);
      if (linkErr) throw linkErr;

      return created.id;
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.ticketId);
      toast.success('Equipo creado y asignado a la tarea.');
    },
    onError: toastMutationError,
  });

  const replaceEquipmentInTicket = useMutation({
    mutationFn: async (input: ReplaceEquipmentInTicketInput) => {
      const { data: newId, error: rpcErr } = await supabase
        .schema('operations')
        .rpc('replace_equipment', {
          p_old_equipment_id: input.old_equipment_id,
          p_new_serial_number: input.new_serial_number,
          p_new_model: input.new_model,
          p_new_description: input.new_description ?? '',
        });
      if (rpcErr) throw rpcErr;
      if (!newId) throw new Error('replace_equipment: RPC returned no id');

      const { error: linkErr } = await supabase
        .schema('support')
        .from('tickets')
        .update({ equipment_id: newId as string })
        .eq('id', input.ticketId);
      if (linkErr) throw linkErr;

      return newId as string;
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.ticketId);
      toast.success('Equipo reemplazado y asignado a la tarea.');
    },
    onError: toastMutationError,
  });

  return {
    assignExistingEquipment,
    createAndAssignEquipment,
    replaceEquipmentInTicket,
  };
}
