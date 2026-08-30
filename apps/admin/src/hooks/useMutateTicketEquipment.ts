import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createAndAssignEquipment as createAndAssignEquipmentRpc } from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { equipmentKey, tareasKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

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
 *   - createAndAssignEquipment: installation → atomically create the
 *     equipment row and link it to the ticket via the
 *     public.create_and_assign_equipment RPC. Retained for the generic
 *     'installation' category which has no product_id and therefore
 *     cannot use the atomic resolve_equipment_installation RPC (that one
 *     is category-guarded to 'equipment_installation' only). A separate
 *     resolve_ticket call still follows this mutation.
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
    mutationFn: (input: CreateAndAssignEquipmentInput) =>
      createAndAssignEquipmentRpc(supabase, {
        ticketId: input.ticketId,
        buildingId: input.buildingId,
        serial: input.serial_number,
        model: input.model,
        description: input.description ?? null,
        accessType: input.access_type,
      }),
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
