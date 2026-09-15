import { Download } from 'lucide-react';
import { DataCardList, type DataTableAction } from '@vitalock/ui';
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
 * Full list of resolved equipment_updates for a given equipment. Card
 * fields: Fecha (title), Resuelto por (staff name), Llaves activadas,
 * Llaves desactivadas; the MDB download is a per-row action (footer
 * button), not a data field — it maps onto `DataTableAction` instead of a
 * column, matching design Decision 4.
 *
 * Flat list, no `groupBy`: this is scoped to ONE equipment's firmware
 * update history, typically a handful of events over the equipment's
 * lifetime — not the daily/weekly cadence of installer tasks or admin's
 * company-wide historial — so a grouping header would add overhead with no
 * scanning benefit (same "flat worklist" treatment as LlavesTable /
 * ServicioTecnicoTable).
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

  const actions: DataTableAction<EquipmentUpdateHistoryRow>[] = [
    {
      icon: Download,
      label: (r) => (downloadingId === r.id ? 'Generando…' : '.mdb'),
      onClick: (r) => void download(r.mdb_storage_path, r.id),
      disabled: (r) => downloadingId === r.id,
    },
  ];

  return (
    <DataCardList<EquipmentUpdateHistoryRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(r) => r.id}
      emptyMessage="No hay actualizaciones de firmware registradas."
      actions={actions}
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
      ]}
    />
  );
}
