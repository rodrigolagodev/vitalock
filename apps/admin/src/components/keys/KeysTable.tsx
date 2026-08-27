import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Power } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { DataTable, type DataTableAction } from '@vitalock/ui';
import { KeyStatusChangeDialog } from './KeyStatusChangeDialog';
import type { KeyRow } from '@/hooks/useKeys';

interface KeysTableProps {
  keys: KeyRow[];
  buildingId: string;
  isFetching?: boolean;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
}

const STATUS_LABEL: Record<KeyRow['status'], string> = {
  pending_creation: 'En creación',
  pending_installation: 'Pendiente de instalación',
  active: 'Activa',
  pending_disable: 'Baja solicitada',
  disabled: 'Dada de baja',
};

const STATUS_TONE: Record<KeyRow['status'], StatusTone> = {
  pending_creation: 'neutral',
  pending_installation: 'warning',
  active: 'success',
  pending_disable: 'warning',
  disabled: 'danger',
};

export function KeysTable({ keys, buildingId, isFetching = false }: KeysTableProps) {
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
              <StatusBadge tone={STATUS_TONE[k.status]}>
                {STATUS_LABEL[k.status]}
              </StatusBadge>
            ),
          },
          {
            header: 'Activada',
            className: 'text-sm text-muted-foreground',
            cell: (k) => fmtDate(k.activated_at),
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
