import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@vitalock/ui';
import { Button, Badge } from '@vitalock/ui';
import { supabase } from '@/lib/supabase';
import { useResolveEquipmentUpdate } from '@/hooks/useResolveEquipmentUpdate';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';
import { useRfidKeyCodeMap } from '@/hooks/useRfidKeyCodeMap';

interface EquipmentUpdateResolveDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: AssignedTicket;
}

/**
 * Full-screen dialog for an equipment_update ticket.
 * Shows the frozen key snapshot (keys to activate / disable),
 * a .mdb download button, and the "Resolver" action.
 *
 * Resolve flow:
 *   - Calls resolve_equipment_update RPC atomically.
 *   - On success: closes dialog, invalidates worklist via hook.
 *   - Keys that were already in the target state are silently skipped by the RPC
 *     and surfaced as a warning to the installer.
 */
interface PriorUpdate {
  id: string;
  created_at: string;
  mdb_storage_path: string;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function EquipmentUpdateResolveDetail({
  open,
  onOpenChange,
  ticket,
}: EquipmentUpdateResolveDetailProps) {
  const snapshot = ticket.equipmentUpdateSnapshot;
  const resolve = useResolveEquipmentUpdate();

  const allKeyIds = snapshot
    ? [...snapshot.keys_to_activate, ...snapshot.keys_to_disable]
    : [];
  const rfidCodeMap = useRfidKeyCodeMap(allKeyIds);

  // Prior resolved updates for this equipment (rollback section)
  const [priorUpdates, setPriorUpdates] = useState<PriorUpdate[]>([]);
  const [downloadingPriorId, setDownloadingPriorId] = useState<string | null>(null);

  useEffect(() => {
    const equipmentId = snapshot?.equipment_id;
    if (!equipmentId) {
      setPriorUpdates([]);
      return;
    }

    let cancelled = false;
    void supabase
      .schema('support')
      .from('equipment_updates')
      .select('id, created_at, mdb_storage_path')
      .eq('equipment_id', equipmentId)
      .not('resolved_at', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setPriorUpdates((data ?? []) as unknown as PriorUpdate[]);
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot?.equipment_id]);

  const handleDownload = async () => {
    if (!snapshot) return;
    const { data, error } = await supabase.storage
      .from('equipment-updates-mdb')
      .createSignedUrl(snapshot.mdb_storage_path, 300);
    if (error || !data?.signedUrl) return;
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = snapshot.mdb_storage_path.split('/').pop() ?? 'db.mdb';
    a.click();
  };

  const handleDownloadPrior = async (update: PriorUpdate) => {
    setDownloadingPriorId(update.id);
    try {
      const { data, error } = await supabase.storage
        .from('equipment-updates-mdb')
        .createSignedUrl(update.mdb_storage_path, 300);
      if (error || !data?.signedUrl) return;
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = update.mdb_storage_path.split('/').pop() ?? 'db.mdb';
      a.click();
    } finally {
      setDownloadingPriorId(null);
    }
  };

  const handleResolve = () => {
    if (!snapshot) return;
    resolve.mutate(
      { taskId: snapshot.task_id, ticketId: ticket.id },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  function keyLabel(id: string): string {
    return rfidCodeMap.get(id) ?? `${id.slice(0, 8)}…`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Actualización de equipo</DialogTitle>
          <DialogDescription className="truncate">
            {ticket.title}
          </DialogDescription>
        </DialogHeader>

        {!snapshot ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No se encontró la tarea de actualización asociada a este ticket.
          </p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {/* Keys to activate */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Llaves a activar ({snapshot.keys_to_activate.length})
              </p>
              {snapshot.keys_to_activate.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguna</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {snapshot.keys_to_activate.map((id) => (
                    <Badge key={id} variant="secondary" className="font-mono text-xs">
                      {keyLabel(id)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Keys to disable */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Llaves a dar de baja ({snapshot.keys_to_disable.length})
              </p>
              {snapshot.keys_to_disable.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguna</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {snapshot.keys_to_disable.map((id) => (
                    <Badge key={id} variant="outline" className="font-mono text-xs">
                      {keyLabel(id)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* MDB download */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleDownload()}
              className="w-fit"
            >
              <Download className="mr-1.5 h-4 w-4" />
              Descargar archivo .mdb
            </Button>
          </div>
        )}

        {/* Prior updates collapsible — only when equipment_id is set */}
        {snapshot?.equipment_id && priorUpdates.length > 0 && (
          <details className="rounded-md border border-border text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium">
              Actualizaciones anteriores
            </summary>
            <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
              {/* Warning banner */}
              <p className="rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
                Atención: cargar un archivo anterior desincronizará la base de datos hasta el próximo update correctivo.
              </p>
              {/* Prior update rows */}
              <div className="flex flex-col gap-1">
                {priorUpdates.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
                  >
                    <span className="text-xs text-muted-foreground">{fmt(u.created_at)}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDownloadPrior(u)}
                      disabled={downloadingPriorId === u.id}
                      className="h-7 px-2 text-xs"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      {downloadingPriorId === u.id ? 'Generando…' : 'Descargar'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={resolve.isPending}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleResolve}
            disabled={!snapshot || resolve.isPending}
          >
            {resolve.isPending ? 'Resolviendo...' : 'Resolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
