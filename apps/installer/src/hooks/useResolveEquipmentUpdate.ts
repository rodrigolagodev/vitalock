import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { resolveEquipmentUpdate } from '@vitalock/supabase';
import type { ResolveEquipmentUpdateResult } from '@vitalock/supabase';
import { useAuthContext } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export type { ResolveEquipmentUpdateResult };

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
 * The mutation result exposes skipped_key_ids so the caller can surface a warning.
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
    onSuccess: (result: ResolveEquipmentUpdateResult) => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      const skipped = result.skipped_key_ids.length;
      if (skipped > 0) {
        toast.warning(
          `Actualización resuelta con ${skipped} ${skipped === 1 ? 'llave omitida' : 'llaves omitidas'}.`,
        );
      } else {
        toast.success('Actualización de equipo resuelta.');
      }
    },
    onError: toastMutationError,
  });
}
