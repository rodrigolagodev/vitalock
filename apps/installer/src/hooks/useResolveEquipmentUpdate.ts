import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { resolveEquipmentUpdate } from '@vitalock/supabase';
import { useAuthContext } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface ResolveEquipmentUpdatePayload {
  /** support.equipment_updates.id (the task snapshot row) */
  taskId: string;
  /** support.tickets.id (used only for query invalidation) */
  ticketId: string;
}

/**
 * Installer-side mutation that resolves an equipment_update task.
 * Calls resolve_equipment_update atomically which:
 *  - Activates keys_to_activate (pending_installation → active)
 *  - Disables keys_to_disable (pending_disable → disabled)
 *  - Transitions the ticket open → in_progress → resolved
 * On success the assigned-tickets worklist is invalidated.
 */
export function useResolveEquipmentUpdate() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: ({ taskId }: ResolveEquipmentUpdatePayload) =>
      resolveEquipmentUpdate(supabase, {
        taskId,
        actorStaffId: staffId || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      toast.success('Actualización de equipo resuelta.');
    },
    onError: toastMutationError,
  });
}
