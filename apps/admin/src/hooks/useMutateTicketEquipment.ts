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

/**
 * Ticket ↔ equipment assignment for technical tickets.
 *   - assignExistingEquipment:  maintenance → link an equipment already
 *     living in the building to the ticket.
 *   - createAndAssignEquipment: installation → create the equipment row
 *     and link it to the ticket. This path is retained for the generic
 *     'installation' category which has no product_id and therefore
 *     cannot use the atomic RPCs (resolve_equipment_installation is
 *     category-guarded to 'equipment_installation' only). The two-step
 *     flow (create + separate resolve_ticket call) remains correct here.
 *
 * NOTE: replaceEquipmentInTicket was retired. equipment_replacement tickets
 * now resolve atomically through useResolveEquipmentReplacement, which calls
 * public.resolve_equipment_replacement and closes the stock ledger in one
 * transaction.
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

  return {
    assignExistingEquipment,
    createAndAssignEquipment,
  };
}
