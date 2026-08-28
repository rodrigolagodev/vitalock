import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toastMutationError } from './mapMutationError';
import { createEquipmentUpdate } from '@vitalock/supabase';
import { equipmentUpdatesKey } from './useEquipmentUpdates';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export interface CreateEquipmentUpdateInput {
  ticketId: string;
  equipmentId: string;
  administrationId: string;
  buildingId: string;
  description: string;
  keysToActivate: string[];
  keysToDisable: string[];
  file: File;
  actorStaffId: string | null;
  /** Staff assigned to resolve the ticket. When null/undefined the ticket lands unassigned. */
  assignedToStaffId?: string | null;
}

export function useMutateEquipmentUpdate() {
  const queryClient = useQueryClient();

  const createEquipmentUpdateMutation = useMutation({
    mutationFn: async (input: CreateEquipmentUpdateInput) => {
      if (input.file.size > MAX_FILE_SIZE) {
        throw new Error('El archivo supera el límite de 50 MB.');
      }

      const storagePath = `${input.ticketId}/${input.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('equipment-updates-mdb')
        .upload(storagePath, input.file, { upsert: false });

      if (uploadError) throw uploadError;

      try {
        const taskId = await createEquipmentUpdate(supabase, {
          equipmentId: input.equipmentId,
          administrationId: input.administrationId,
          buildingId: input.buildingId,
          description: input.description,
          mdbStoragePath: storagePath,
          keysToActivate: input.keysToActivate,
          keysToDisable: input.keysToDisable,
          actorStaffId: input.actorStaffId,
          assignedToStaffId: input.assignedToStaffId ?? null,
        });
        return taskId;
      } catch (rpcError) {
        await supabase.storage
          .from('equipment-updates-mdb')
          .remove([storagePath]);
        throw rpcError;
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: equipmentUpdatesKey(vars.equipmentId),
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tareas'] });
      toast.success('Tarea de actualización creada correctamente.');
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message.includes('50 MB')) {
        toast.error(err.message);
        return;
      }
      toastMutationError(err);
    },
  });

  return { createEquipmentUpdate: createEquipmentUpdateMutation };
}
