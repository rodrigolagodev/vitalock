import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, Settings2, UserCheck } from 'lucide-react';
import {
  DataTable,
  StatusBadge,
  type DataTableAction,
} from '@vitalock/ui';
import { ConfigureKeyItemSheet } from './ConfigureKeyItemSheet';
import { PickupKeyDialog, type PickupPersonPrefill } from './PickupKeyDialog';
import { KeyItemDetailsDialog } from './KeyItemDetailsDialog';
import { useBuildingsByIds } from '@/hooks/useBuildingsByIds';
import { useMutateKeyOrder } from '@/hooks/useMutateKeyOrder';
import { formatCurrencyARS } from '@/lib/format';
import { keyItemStatusLabel, keyItemStatusTone } from '@/lib/status/keyItemStatus';
import type { KeyOrderItemRow, KeyOrderDetailRow } from '@/hooks/useKeyOrder';

interface KeyOrderItemsTableProps {
  items: KeyOrderItemRow[];
  orderId: string;
  /** Current order status — gates the "Configurar" action. */
  orderStatus: KeyOrderDetailRow['status'];
  /**
   * Pickup registration is allowed (particular order in ready_for_pickup).
   * When true, configured key rows without a picked_up_at timestamp show the
   * "Registrar retiro" action.
   */
  canRegisterPickup?: boolean;
  /**
   * Order buyer — used as a fallback prefill when an item has no explicit
   * pickup particular.
   */
  buyer?: {
    id: string;
    full_name: string;
    dni: string;
  } | null;
  /** Loading state — renders the DataTable pulse skeleton. */
  isFetching?: boolean;
}

export function KeyOrderItemsTable({
  items,
  orderId,
  orderStatus,
  canRegisterPickup = false,
  buyer,
  isFetching = false,
}: KeyOrderItemsTableProps) {
  const [configureItem, setConfigureItem] = useState<KeyOrderItemRow | null>(null);
  const [pickupItem, setPickupItem] = useState<KeyOrderItemRow | null>(null);
  const [detailsItem, setDetailsItem] = useState<KeyOrderItemRow | null>(null);

  const { markKeyOrderItemInstalled } = useMutateKeyOrder();

  const buildingIds = useMemo(
    () => items.map((it) => it.building_id).filter((id): id is string => Boolean(id)),
    [items],
  );
  const { data: buildingsMap } = useBuildingsByIds(buildingIds);

  const actions: DataTableAction<KeyOrderItemRow>[] = [
    {
      icon: Settings2,
      label: () => 'Configurar llave',
      onClick: (item) => setConfigureItem(item),
      show: (item) =>
        item.status === 'pending' &&
        (orderStatus === 'confirmed' || orderStatus === 'in_progress'),
    },
    {
      icon: CheckCircle2,
      label: () => 'Marcar instalada',
      onClick: (item) => {
        markKeyOrderItemInstalled.mutate({
          orderItemId: item.id,
          orderId,
        });
      },
      show: (item) =>
        item.status === 'configured' &&
        (orderStatus === 'in_progress' || orderStatus === 'pending_installation'),
    },
    {
      icon: UserCheck,
      label: () => 'Registrar retiro',
      onClick: (item) => setPickupItem(item),
      show: (item) =>
        canRegisterPickup &&
        item.status === 'installed' &&
        item.produced_key_id != null &&
        (item.rfid_keys?.picked_up_at ?? null) == null,
    },
    {
      icon: Eye,
      label: () => 'Ver detalles de llave',
      onClick: (item) => setDetailsItem(item),
      show: (item) => item.produced_key_id != null,
    },
  ];

  return (
    <>
      <DataTable
        rows={items}
        isFetching={isFetching}
        columns={[
          {
            header: 'Cantidad',
            cell: (item) => item.quantity,
            className: 'text-right',
          },
          {
            header: 'Edificio',
            cell: (item) =>
              item.building_id
                ? buildingsMap?.get(item.building_id)?.name ?? item.building_id
                : '—',
            className: 'text-muted-foreground',
          },
          {
            header: 'Precio',
            cell: (item) => formatCurrencyARS(item.unit_price),
            className: 'text-right',
          },
          {
            header: 'Estado',
            cell: (item) => (
              <StatusBadge tone={keyItemStatusTone(item.status)}>
                {keyItemStatusLabel(item.status)}
              </StatusBadge>
            ),
          },
          {
            header: 'Retira',
            cell: (item) => {
              const authorized = item.pickup_particulares ?? buyer ?? null;
              return authorized ? (
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
