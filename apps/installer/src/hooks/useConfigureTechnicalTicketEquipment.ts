import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  configureTechnicalTicketEquipment,
  type ConfigureTechnicalTicketEquipmentInput,
} from '@vitalock/supabase';
import { useAuthContext } from '@vitalock/shared';
import { supabase } from '@/lib/supabase';
import { assignedTicketsKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

/**
 * Step 1 of the two-step equipment task flow. Loads the serial (and optional
 * model) into the ticket and transitions it to in_progress. Physical side
 * effects run at finalize time via resolve_ticket.
 */
export function useConfigureTechnicalTicketEquipment() {
  const { staff } = useAuthContext();
  const queryClient = useQueryClient();
  const staffId = staff?.id ?? '';

  return useMutation({
    mutationFn: (input: ConfigureTechnicalTicketEquipmentInput) =>
      configureTechnicalTicketEquipment(supabase, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
      toast.success('Equipo configurado. Marcá la tarea para finalizarla.');
    },
    onError: toastMutationError,
  });
}
