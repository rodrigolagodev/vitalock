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
import { KeyItemDetailsDialog } from './KeyItemDetailsDialog';
import type { OrderItemRow, ParticularRef, OrdenDetailRow } from '@/hooks/useOrden';

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
  /** Current order status — gates the "Configurar" action to in_progress. */
  orderStatus: OrdenDetailRow['status'];
  /**
   * Pickup registration is allowed (particular order in ready_for_pickup).
   * When true, configured key rows without a picked_up_at timestamp show the
   * "Registrar retiro" action, which opens PickupKeyDialog.
   */
  canRegisterPickup?: boolean;
  /**
   * Order buyer — used as a fallback prefill when an item has no explicit
   * pickup particular (e.g. legacy orders created before per-item pickup).
   */
  buyer?: ParticularRef | null;
}

export function OrderItemsTable({
  items,
  orderId,
  orderStatus,
  canRegisterPickup = false,
  buyer,
}: OrderItemsTableProps) {
  const [configureItem, setConfigureItem] = useState<OrderItemRow | null>(null);
  const [pickupItem, setPickupItem] = useState<OrderItemRow | null>(null);
  const [detailsItem, setDetailsItem] = useState<OrderItemRow | null>(null);
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
              <TableHead>Retira</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Sin ítems
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const isPending = item.status === 'pending';
                // Configure is offered right after confirm (order in
                // 'confirmed') and while actively being prepared
                // ('in_progress'). The keys state machine promotes
                // confirmed → in_progress as soon as the first key is
                // configured, so gating on in_progress alone would deadlock.
                // Hidden in draft (not confirmed yet) and in every later
                // status (already configured or beyond).
                const canConfigure =
                  item.item_type === 'key' &&
                  isPending &&
                  (orderStatus === 'confirmed' || orderStatus === 'in_progress');
                const canPickup =
                  canRegisterPickup &&
                  item.item_type === 'key' &&
                  item.produced_key_id != null &&
                  !item.rfid_keys?.picked_up_at;
                const canViewDetails =
                  item.item_type === 'key' && item.produced_key_id != null;

                // Item-level authorized retirer wins; buyer is the fallback
                // (legacy rows or items where no explicit retirer was set).
                const authorized = item.pickup_particulares ?? buyer ?? null;

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
                    <TableCell className="text-sm">
                      {item.item_type === 'key' && authorized ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{authorized.full_name}</span>
                          <span className="text-xs text-muted-foreground">
                            DNI {authorized.dni}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canConfigure && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfigureItem(item)}
                          >
                            Configurar
                          </Button>
                        )}
                        {canViewDetails && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailsItem(item)}
                          >
                            Ver detalles
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

      {pickupItem &&
        (() => {
          const perItemAuth = pickupItem.pickup_particulares ?? buyer ?? null;
          const prefill: PickupPersonPrefill | null = perItemAuth
            ? { full_name: perItemAuth.full_name, dni: perItemAuth.dni }
            : null;
          return (
            <PickupKeyDialog
              open={pickupItem !== null}
              onOpenChange={(v) => {
                if (!v) setPickupItem(null);
              }}
              item={pickupItem}
              orderId={orderId}
              pickupPerson={prefill}
            />
          );
        })()}

      {detailsItem && (
        <KeyItemDetailsDialog
          open={detailsItem !== null}
          onOpenChange={(v) => {
            if (!v) setDetailsItem(null);
          }}
          item={detailsItem}
        />
      )}
    </>
  );
}
