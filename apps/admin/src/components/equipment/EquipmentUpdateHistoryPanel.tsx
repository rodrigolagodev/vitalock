import { Download } from 'lucide-react';
import { DataTable } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useMdbDownload } from '@vitalock/shared';
import { formatDateTime } from '@/lib/format';
import { useEquipmentUpdateHistory } from '@/hooks/useEquipmentUpdateHistory';
import { useStaffByIds } from '@/hooks/useStaffByIds';
import type { EquipmentUpdateHistoryRow } from '@/hooks/useEquipmentUpdateHistory';

interface EquipmentUpdateHistoryPanelProps {
  equipmentId: string;
}

/**
 * Full list of resolved equipment_updates for a given equipment.
 * Columns: Fecha, Resuelto por (staff name), Llaves activadas, Llaves desactivadas, Descargar MDB.
 */
export function EquipmentUpdateHistoryPanel({ equipmentId }: EquipmentUpdateHistoryPanelProps) {
  const { data: rows = [], isFetching } = useEquipmentUpdateHistory(equipmentId);
  const { download, downloadingId } = useMdbDownload(supabase, {
    onError: () => toast.error('No se pudo generar el enlace de descarga.'),
  });

  // Batch-fetch staff names for resolved_by_staff_id
  const staffIds = [
    ...new Set(rows.map((r) => r.resolved_by_staff_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: staffMap } = useStaffByIds(staffIds);

  return (
    <DataTable<EquipmentUpdateHistoryRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(r) => r.id}
      emptyMessage="No hay actualizaciones de firmware registradas."
      columns={[
        {
          header: 'Fecha',
          cell: (r) => formatDateTime(r.created_at),
        },
        {
          header: 'Resuelto por',
          cell: (r) =>
            r.resolved_by_staff_id
              ? (staffMap?.get(r.resolved_by_staff_id)?.full_name ??
                r.resolved_by_staff_id.slice(0, 8) + '…')
              : '—',
          className: 'text-sm text-muted-foreground',
        },
        {
          header: 'Activadas',
          cell: (r) => String(r.keys_to_activate.length),
          className: 'text-center text-sm',
        },
        {
          header: 'Desactivadas',
          cell: (r) => String(r.keys_to_disable.length),
          className: 'text-center text-sm',
        },
        {
          header: 'Descargar MDB',
          cell: (r) => (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void download(r.mdb_storage_path, r.id)}
              disabled={downloadingId === r.id}
              className="w-fit"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingId === r.id ? 'Generando…' : '.mdb'}
            </Button>
          ),
        },
      ]}
    />
  );
}
