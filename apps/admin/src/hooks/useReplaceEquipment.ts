import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { equipmentKey } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/errors/toast';

export interface ReplaceEquipmentInput {
  old_equipment_id: string;
  new_serial_number: string;
  new_model: string;
  new_description?: string;
}

/**
 * Wraps the operations.replace_equipment RPC.
 * The RPC atomically:
 *   1. Marks the old equipment as dead
 *   2. Creates a new equipment record with replaces_equipment_id = old device id
 *   3. Migrates installed key_authorizations to pending_install on the new device
 */
export function useReplaceEquipment(buildingId: string) {
  const queryClient = useQueryClient();

  const replaceEquipment = useMutation({
    mutationFn: async (input: ReplaceEquipmentInput) => {
      const { data, error } = await supabase
        .schema('operations')
        .rpc('replace_equipment', {
          p_old_equipment_id: input.old_equipment_id,
          p_new_serial_number: input.new_serial_number,
          p_new_model: input.new_model,
          p_new_description: input.new_description ?? '',
        });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentKey(buildingId) });
      toast.success('Equipo reemplazado correctamente.');
    },
    onError: (err) => {
      toastMutationError(err);
    },
  });

  return { replaceEquipment };
}
