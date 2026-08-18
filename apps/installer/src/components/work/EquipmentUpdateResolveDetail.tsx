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
