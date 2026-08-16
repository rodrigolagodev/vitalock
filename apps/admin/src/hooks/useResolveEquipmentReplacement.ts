import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { equipmentKey, tareasKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface ResolveEquipmentReplacementInput {
  ticketId: string;
  oldEquipmentId: string;
  newSerial: string;
  newModel: string;
  newDescription?: string | null;
  note?: string | null;
}

/**
 * Atomically resolves an equipment_replacement ticket.
 * Calls public.resolve_equipment_replacement which:
 *   - Delegates the equipment swap to operations.replace_equipment.
 *   - Emits egreso_reemplazo + liberacion_reserva when product_id IS NOT NULL.
 *   - Updates support.tickets.equipment_id to the new equipment UUID.
 *   - Transitions the ticket to resolved via the two-step state machine.
 *
 * Used exclusively from AssignEquipmentDialog for the equipment_replacement category.
 */
export function useResolveEquipmentReplacement(buildingId: string | null | undefined) {
  const queryClient = useQueryClient();

  const invalidate = (ticketId: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tarea', ticketId] });
    queryClient.invalidateQueries({ queryKey: tareasKey() });
    if (buildingId) {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
    }
  };

  return useMutation({
    mutationFn: async (input: ResolveEquipmentReplacementInput) => {
      const { data, error } = await supabase.rpc('resolve_equipment_replacement', {
        p_ticket_id: input.ticketId,
        p_old_equipment_id: input.oldEquipmentId,
        p_new_serial: input.newSerial,
        p_new_model: input.newModel,
        p_new_description: input.newDescription ?? null,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.ticketId);
      toast.success('Equipo reemplazado y tarea resuelta.');
    },
    onError: toastMutationError,
  });
}
