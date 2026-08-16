import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { equipmentKey, tareasKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface ResolveEquipmentInstallationInput {
  ticketId: string;
  serial: string;
  unitId?: string | null;
  note?: string | null;
}

/**
 * Atomically resolves an equipment_installation ticket.
 * Calls public.resolve_equipment_installation which:
 *   - Creates the operations.equipment row.
 *   - Emits egreso_instalacion + liberacion_reserva when product_id IS NOT NULL.
 *   - Transitions the ticket to resolved via the two-step state machine.
 *
 * Used exclusively from AssignEquipmentDialog for the equipment_installation category.
 */
export function useResolveEquipmentInstallation(buildingId: string | null | undefined) {
  const queryClient = useQueryClient();

  const invalidate = (ticketId: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tarea', ticketId] });
    queryClient.invalidateQueries({ queryKey: tareasKey() });
    if (buildingId) {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
    }
  };

  return useMutation({
    mutationFn: async (input: ResolveEquipmentInstallationInput) => {
      const { data, error } = await supabase.rpc('resolve_equipment_installation', {
        p_ticket_id: input.ticketId,
        p_serial: input.serial,
        p_unit_id: input.unitId ?? null,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.ticketId);
      toast.success('Equipo instalado y tarea resuelta.');
    },
    onError: toastMutationError,
  });
}
