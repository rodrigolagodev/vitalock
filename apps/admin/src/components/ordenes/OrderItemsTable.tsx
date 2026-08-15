import { useState } from 'react';
import { Ban, Eye, PackageCheck, Settings2 } from 'lucide-react';
import {
  DataTable,
  StatusBadge,
  type DataTableAction,
  type StatusTone,
} from '@vitalock/ui';
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

const ITEM_STATUS_TONES: Record<string, StatusTone> = {
  pending: 'neutral',
  configured: 'brand',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
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
  /** Loading state — renders the DataTable pulse skeleton. */
  isFetching?: boolean;
}

export function OrderItemsTable({
  items,
  orderId,
  orderStatus,
  canRegisterPickup = false,
  buyer,
  isFetching = false,
}: OrderItemsTableProps) {
  const [configureItem, setConfigureItem] = useState<OrderItemRow | null>(null);
  const [pickupItem, setPickupItem] = useState<OrderItemRow | null>(null);
  const [detailsItem, setDetailsItem] = useState<OrderItemRow | null>(null);
  const { cancelOrderItem } = useMutateOrderItem();

  const handleCancel = (item: OrderItemRow) => {
    cancelOrderItem.mutate({ id: item.id, orderId });
  };

  const itemLabel = (item: OrderItemRow) =>
    item.description ?? ITEM_TYPE_LABELS[item.item_type] ?? item.item_type;

  const actions: DataTableAction<OrderItemRow>[] = [
    {
      icon: Settings2,
      label: (item) => `Configurar ${itemLabel(item)}`,
      onClick: (item) => setConfigureItem(item),
      // Configure is offered right after confirm (order in 'confirmed') and
      // while actively being prepared ('in_progress'). The keys state machine
      // promotes confirmed → in_progress as soon as the first key is
      // configured, so gating on in_progress alone would deadlock. Hidden in
      // draft (not confirmed yet) and in every later status.
      show: (item) =>
        item.item_type === 'key' &&
        item.status === 'pending' &&
        (orderStatus === 'confirmed' || orderStatus === 'in_progress'),
    },
    {
      icon: Eye,
      label: (item) => `Ver detalles de ${itemLabel(item)}`,
      onClick: (item) => setDetailsItem(item),
      show: (item) => item.item_type === 'key' && item.produced_key_id != null,
    },
    {
      icon: Ban,
      label: (item) => `Cancelar ítem ${itemLabel(item)}`,
      onClick: handleCancel,
      className: 'text-destructive hover:text-destructive',
      show: (item) => item.status === 'pending',
      disabled: () => cancelOrderItem.isPending,
    },
    {
      icon: PackageCheck,
      label: (item) => `Registrar retiro de ${itemLabel(item)}`,
      onClick: (item) => setPickupItem(item),
      show: (item) =>
        canRegisterPickup &&
        item.item_type === 'key' &&
        item.produced_key_id != null &&
        !item.rfid_keys?.picked_up_at,
    },
  ];

  return (
    <>
      <DataTable
        rows={items}
        isFetching={isFetching}
        columns={[
          { header: 'Tipo', cell: (item) => ITEM_TYPE_LABELS[item.item_type] ?? item.item_type },
          {
            header: 'Descripción',
            cell: (item) => item.description ?? '—',
            className: 'text-muted-foreground',
          },
          { header: 'Cantidad', cell: (item) => item.quantity, className: 'text-right' },
          {
            header: 'Estado',
            cell: (item) => (
              <StatusBadge tone={ITEM_STATUS_TONES[item.status] ?? 'neutral'}>
                {ITEM_STATUS_LABELS[item.status] ?? item.status}
              </StatusBadge>
            ),
          },
          {
            header: 'Retira',
            cell: (item) => {
              // Item-level authorized retirer wins; buyer is the fallback
              // (legacy rows or items where no explicit retirer was set).
              const authorized = item.pickup_particulares ?? buyer ?? null;
              return item.item_type === 'key' && authorized ? (
                <div className="flex flex-col">
                  <span className="font-medium">{authorized.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    DNI {authorized.dni}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              );
            },
            className: 'text-sm',
          },
        ]}
        rowKey={(item) => item.id}
        actions={actions}
        emptyMessage="Sin ítems"
      />

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
