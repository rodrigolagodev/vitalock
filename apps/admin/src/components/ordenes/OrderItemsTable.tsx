import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMutateOrderItem } from '@/hooks/useMutateOrderItem';
import { ConfigureKeyItemSheet } from './ConfigureKeyItemSheet';
import { PickupKeyDialog, type PickupPersonPrefill } from './PickupKeyDialog';
import type { OrderItemRow } from '@/hooks/useOrden';

const ITEM_TYPE_LABELS: Record<string, string> = {
  key: 'Llave',
  equipment: 'Equipo',
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
};

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  configured: 'Configurado',
  in_progress: 'En proceso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const ITEM_STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'secondary',
  configured: 'default',
  in_progress: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
};

interface OrderItemsTableProps {
  items: OrderItemRow[];
  orderId: string;
  /**
   * Pickup registration is allowed (particular order in ready_for_pickup).
   * When true, configured key rows without a picked_up_at timestamp show the
   * "Registrar retiro" action, which opens PickupKeyDialog.
   */
  canRegisterPickup?: boolean;
  /** Authorized pickup person — prefills the pickup registration dialog. */
  pickupPerson?: PickupPersonPrefill | null;
}

export function OrderItemsTable({
  items,
  orderId,
  canRegisterPickup = false,
  pickupPerson,
}: OrderItemsTableProps) {
  const [configureItem, setConfigureItem] = useState<OrderItemRow | null>(null);
  const [pickupItem, setPickupItem] = useState<OrderItemRow | null>(null);
  const { cancelOrderItem } = useMutateOrderItem();

  const handleCancel = (item: OrderItemRow) => {
    cancelOrderItem.mutate({ id: item.id, orderId });
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Sin ítems
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const isPending = item.status === 'pending';
                const isKeyPending = item.item_type === 'key' && isPending;
                const canPickup =
                  canRegisterPickup &&
                  item.item_type === 'key' &&
                  item.produced_key_id != null &&
                  !item.rfid_keys?.picked_up_at;

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className="font-medium">
                        {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell>
                      <Badge variant={ITEM_STATUS_VARIANTS[item.status] ?? 'secondary'}>
                        {ITEM_STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isKeyPending && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfigureItem(item)}
                          >
                            Configurar
                          </Button>
                        )}
                        {isPending && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleCancel(item)}
                            disabled={cancelOrderItem.isPending}
                          >
                            Cancelar ítem
                          </Button>
                        )}
                        {canPickup && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPickupItem(item)}
                          >
                            Registrar retiro
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {configureItem && (
        <ConfigureKeyItemSheet
          open={configureItem !== null}
          onOpenChange={(v) => {
            if (!v) setConfigureItem(null);
          }}
          item={configureItem}
          orderId={orderId}
        />
      )}

      {pickupItem && (
        <PickupKeyDialog
          open={pickupItem !== null}
          onOpenChange={(v) => {
            if (!v) setPickupItem(null);
          }}
          item={pickupItem}
          orderId={orderId}
          pickupPerson={pickupPerson}
        />
      )}
    </>
  );
}
