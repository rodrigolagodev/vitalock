import { useState } from 'react';
import { Download } from 'lucide-react';
import { StatusBadge } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/format';
import { tareaStatusLabel, tareaStatusTone } from '@/lib/status/tareaStatus';
import type { EquipmentUpdateRow } from '@/hooks/useEquipmentUpdates';

interface EquipmentUpdateTaskDetailProps {
  update: EquipmentUpdateRow;
  keysToActivate: Array<{ id: string; rfid_code: string; unit: { number: string } }>;
  keysToDisable: Array<{ id: string; rfid_code: string; unit: { number: string } }>;
}

export function EquipmentUpdateTaskDetail({
  update,
  keysToActivate,
  keysToDisable,
}: EquipmentUpdateTaskDetailProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('equipment-updates-mdb')
        .createSignedUrl(update.mdb_storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('No se pudo generar el enlace de descarga.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Estado:</span>
        <StatusBadge tone={tareaStatusTone(update.ticket_status)}>
          {tareaStatusLabel(update.ticket_status)}
        </StatusBadge>
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-muted-foreground">Creada</span>
        <span>{formatDateTime(update.created_at)}</span>
        {update.resolved_at && (
          <>
            <span className="text-muted-foreground">Resuelta</span>
            <span>{formatDateTime(update.resolved_at)}</span>
          </>
        )}
      </div>

      {/* Keys to activate */}
      <div>
        <p className="text-sm font-semibold mb-1">
          Altas ({keysToActivate.length})
        </p>
        {keysToActivate.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin llaves a activar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {keysToActivate.map((k) => (
              <li key={k.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono">{k.rfid_code}</span>
                <span className="text-muted-foreground">· Unidad {k.unit.number}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Keys to disable */}
      <div>
        <p className="text-sm font-semibold mb-1">
          Bajas ({keysToDisable.length})
        </p>
        {keysToDisable.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin llaves a dar de baja.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {keysToDisable.map((k) => (
              <li key={k.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono">{k.rfid_code}</span>
                <span className="text-muted-foreground">· Unidad {k.unit.number}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* MDB download */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
        className="w-fit"
      >
        <Download className="mr-2 h-4 w-4" />
        {downloading ? 'Generando enlace...' : 'Descargar .mdb'}
      </Button>
    </div>
  );
}
