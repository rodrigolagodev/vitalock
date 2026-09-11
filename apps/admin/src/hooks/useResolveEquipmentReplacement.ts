import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  resolveEquipmentReplacement,
  type ResolveEquipmentReplacementInput,
} from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { equipmentKey, tareaKey, tareasKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

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
    void queryClient.invalidateQueries({ queryKey: tareaKey(ticketId) });
    void queryClient.invalidateQueries({ queryKey: tareasKey() });
    if (buildingId) {
      void queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
    }
  };

  return useMutation({
    mutationFn: (input: ResolveEquipmentReplacementInput) =>
      resolveEquipmentReplacement(supabase, input),
    onSuccess: (_data, vars) => {
      invalidate(vars.ticketId);
      toast.success('Equipo reemplazado y tarea resuelta.');
    },
    onError: toastMutationError,
  });
}
