import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { ordensKey, ordenKey, keysKey } from '@/lib/queryKeys';
import { toastMutationError } from './mapMutationError';

export interface ConfigureKeyItemInput {
  orderItemId: string;
  orderId: string;
  rfidCode: string;
  unitId: string;
  equipmentIds: string[];
  buildingId?: string;
}

export interface CancelOrderItemInput {
  id: string;
  orderId: string;
}

export function useMutateOrderItem() {
  const queryClient = useQueryClient();

  const configureKeyItem = useMutation({
    mutationFn: async ({
      orderItemId,
      rfidCode,
      unitId,
      equipmentIds,
    }: ConfigureKeyItemInput) => {
      const { data, error } = await supabase.rpc('configure_key_order_item', {
        p_order_item_id: orderItemId,
        p_rfid_code: rfidCode,
        p_unit_id: unitId,
        p_equipment_ids: equipmentIds,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.orderId) });
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      void queryClient.invalidateQueries({ queryKey: keysKey(vars.buildingId) });
      toast.success('Llave configurada correctamente.');
    },
    onError: toastMutationError,
  });

  const cancelOrderItem = useMutation({
    mutationFn: async ({ id, orderId }: CancelOrderItemInput) => {
      // Phase 1: Determine order_kind via the all_orders VIEW to select the right items table.
      const { data: kindRow, error: kindError } = await supabase
        .from('all_orders')
        .select('order_kind')
        .eq('id', orderId)
        .single();

      if (kindError) throw kindError;

      const orderKind = (kindRow as unknown as { order_kind: string } | null)?.order_kind;

      // Phase 2: Cancel the item in the correct bounded-context table.
      const itemsTable = orderKind === 'technical' ? 'technical_order_items' : 'key_order_items';

      const { error } = await supabase
        .from(itemsTable as 'key_order_items')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ordenKey(vars.orderId) });
      void queryClient.invalidateQueries({ queryKey: ordensKey() });
      toast.success('Ítem cancelado.');
    },
    onError: toastMutationError,
  });

  return { configureKeyItem, cancelOrderItem };
}
