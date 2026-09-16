import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Power } from 'lucide-react';
import { Badge, Button, DataCardList, cn } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { KeyStatusChangeDialog } from './KeyStatusChangeDialog';
import type { KeyRow } from '@/hooks/useKeys';
import { keyStatus } from '@/lib/status/keyStatus';

interface KeysTableProps {
  keys: KeyRow[];
  buildingId: string;
  isFetching?: boolean;
  hasFilters?: boolean;
}

/**
 * Card list of a building's key roster. The `Unidad` column used to hand-
 * build a mini-card inside a single table cell (unit number + unit type +
 * an "Admin" `Badge` all composed with manual flex markup) — the same
 * already-faking-a-card tell found and removed from installer's and
 * admin's `TareasTable`. Each constituent part is now its own
 * `DataTableColumn`/meta row (`Unidad`, `Tipo de unidad`, `Unidad
 * administrativa`) so `DataCardList` renders them as ordinary card content
 * instead of hand-rolled JSX.
 */
export function KeysTable({
  keys,
  buildingId,
  isFetching = false,
  hasFilters = false,
}: KeysTableProps) {
  const navigate = useNavigate();
  const [changingStatusFor, setChangingStatusFor] = useState<KeyRow | null>(null);

  return (
    <>
      <DataCardList<KeyRow>
        rows={keys}
        isFetching={isFetching}
        rowKey={(k) => k.id}
        firstCell="button"
        onFirstCellClick={(k) => navigate(`/llaves/inventario/${k.id}`)}
        emptyMessage="No hay llaves registradas."
        hasFilters={hasFilters}
        filteredEmptyMessage="No se encontraron llaves con los filtros aplicados."
        renderActions={(k) =>
          k.status === 'active' || k.status === 'pending_disable' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'w-full gap-2',
                k.status === 'active' && 'text-destructive hover:text-destructive',
              )}
              aria-label={
                k.status === 'active'
                  ? `Solicitar baja de ${k.rfid_code}`
                  : `Cancelar baja de ${k.rfid_code}`
              }
              onClick={() => setChangingStatusFor(k)}
            >
              <Power className="h-4 w-4" />
              {k.status === 'active' ? 'Solicitar baja' : 'Cancelar baja'}
            </Button>
          ) : null
        }
        columns={[
          {
            header: 'RFID',
            cell: (k) => <span className="font-mono text-sm">{k.rfid_code}</span>,
          },
          {
            header: 'Unidad',
            cell: (k) => k.unit.number,
          },
          {
            header: 'Tipo de unidad',
            className: 'text-muted-foreground',
            cell: (k) => k.unit.unit_type ?? '—',
          },
          {
            header: 'Unidad administrativa',
            cell: (k) =>
              k.unit.is_administrative ? (
                <Badge variant="secondary" className="text-xs">
                  Admin
                </Badge>
              ) : (
                '—'
              ),
          },
          {
            header: 'Estado',
            cell: (k) => <keyStatus.Badge status={k.status} />,
            card: 'status',
          },
          {
            header: 'Activada',
            className: 'text-sm text-muted-foreground',
            cell: (k) => formatDate(k.activated_at),
          },
          {
            header: 'Retirada por',
            className: 'text-sm text-muted-foreground',
            cell: (k) =>
              k.picked_up_by_name || k.picked_up_by_surname
                ? `${k.picked_up_by_name ?? ''} ${k.picked_up_by_surname ?? ''}`.trim()
                : '—',
          },
        ]}
      />

      <KeyStatusChangeDialog
        open={Boolean(changingStatusFor)}
        onOpenChange={(o) => !o && setChangingStatusFor(null)}
        buildingId={buildingId}
        keyRow={changingStatusFor}
      />
    </>
  );
}
