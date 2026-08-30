import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Power } from 'lucide-react';
import { StatusBadge } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { DataTable, type DataTableAction } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { KeyStatusChangeDialog } from './KeyStatusChangeDialog';
import type { KeyRow } from '@/hooks/useKeys';
import { keyStatusLabel, keyStatusTone } from '@/lib/status/keyStatus';

interface KeysTableProps {
  keys: KeyRow[];
  buildingId: string;
  isFetching?: boolean;
  hasFilters?: boolean;
}

export function KeysTable({
  keys,
  buildingId,
  isFetching = false,
  hasFilters = false,
}: KeysTableProps) {
  const navigate = useNavigate();
  const [changingStatusFor, setChangingStatusFor] = useState<KeyRow | null>(null);

  const actions: DataTableAction<KeyRow>[] = [
    {
      icon: Power,
      label: (k) => {
        if (k.status === 'active') return `Solicitar baja de ${k.rfid_code}`;
        if (k.status === 'pending_disable') return `Cancelar baja de ${k.rfid_code}`;
        return `Ver ${k.rfid_code}`;
      },
      className: (k) => (k.status === 'active' ? 'text-destructive hover:text-destructive' : ''),
      show: (k) => k.status === 'active' || k.status === 'pending_disable',
      onClick: (k) => setChangingStatusFor(k),
    },
  ];

  return (
    <>
      <DataTable<KeyRow>
        rows={keys}
        isFetching={isFetching}
        rowKey={(k) => k.id}
        firstCell="button"
        onFirstCellClick={(k) => navigate(`/llaves/inventario/${k.id}`)}
        emptyMessage="No hay llaves registradas."
        hasFilters={hasFilters}
        filteredEmptyMessage="No se encontraron llaves con los filtros aplicados."
        actions={actions}
        columns={[
          {
            header: 'RFID',
            cell: (k) => <span className="font-mono text-sm">{k.rfid_code}</span>,
          },
          {
            header: 'Unidad',
            cell: (k) => (
              <div className="flex items-center gap-2">
                <span>{k.unit.number}</span>
                {k.unit.unit_type && (
                  <span className="text-xs text-muted-foreground">· {k.unit.unit_type}</span>
                )}
                {k.unit.is_administrative && (
                  <Badge variant="secondary" className="text-xs">
                    Admin
                  </Badge>
                )}
              </div>
            ),
          },
          {
            header: 'Estado',
            cell: (k) => (
              <StatusBadge tone={keyStatusTone(k.status)}>
                {keyStatusLabel(k.status)}
              </StatusBadge>
            ),
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
