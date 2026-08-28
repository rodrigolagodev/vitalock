import { useState } from 'react';
import { Download } from 'lucide-react';
import { DataTable } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useEquipmentUpdateHistory } from '@/hooks/useEquipmentUpdateHistory';
import { useStaffByIds } from '@/hooks/useStaffByIds';
import type { EquipmentUpdateHistoryRow } from '@/hooks/useEquipmentUpdateHistory';

interface EquipmentUpdateHistoryPanelProps {
  equipmentId: string;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Full list of resolved equipment_updates for a given equipment.
 * Columns: Fecha, Resuelto por (staff name), Llaves activadas, Llaves desactivadas, Descargar MDB.
 */
export function EquipmentUpdateHistoryPanel({ equipmentId }: EquipmentUpdateHistoryPanelProps) {
  const { data: rows = [], isFetching } = useEquipmentUpdateHistory(equipmentId);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Batch-fetch staff names for resolved_by_staff_id
  const staffIds = [
    ...new Set(
      rows
        .map((r) => r.resolved_by_staff_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: staffMap } = useStaffByIds(staffIds);

  const handleDownload = async (row: EquipmentUpdateHistoryRow) => {
    setDownloadingId(row.id);
    try {
      const { data, error } = await supabase.storage
        .from('equipment-updates-mdb')
        .createSignedUrl(row.mdb_storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('No se pudo generar el enlace de descarga.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <DataTable<EquipmentUpdateHistoryRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(r) => r.id}
      emptyMessage="No hay actualizaciones de firmware registradas."
      columns={[
        {
          header: 'Fecha',
          cell: (r) => fmt(r.created_at),
        },
        {
          header: 'Resuelto por',
          cell: (r) =>
            r.resolved_by_staff_id
              ? (staffMap?.get(r.resolved_by_staff_id)?.full_name ?? r.resolved_by_staff_id.slice(0, 8) + '…')
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
              onClick={() => void handleDownload(r)}
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
