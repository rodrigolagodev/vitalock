import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  configureTechnicalTicketEquipment,
  type ConfigureTechnicalTicketEquipmentInput,
} from '@vitalock/supabase';
import { supabase } from '@/lib/supabase';
import { tareasKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

/**
 * Step 1 of the two-step equipment task flow. Writes the operator-supplied
 * serial/model into the ticket and transitions it to in_progress. Physical
 * side effects are deferred to the finalize step (resolve_ticket).
 */
export function useConfigureTechnicalTicketEquipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConfigureTechnicalTicketEquipmentInput) =>
      configureTechnicalTicketEquipment(supabase, input),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tarea', vars.ticketId] });
      queryClient.invalidateQueries({ queryKey: tareasKey() });
      toast.success('Equipo configurado. Falta finalizar la tarea.');
    },
    onError: toastMutationError,
  });
}
