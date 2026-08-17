import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Label } from '@/components/ui/label';
import { Textarea } from '@vitalock/ui';
import { useMutateKey } from '@/hooks/useMutateKey';
import { useAuthContext } from '@vitalock/shared';
import type { KeyRow } from '@/hooks/useKeys';

interface KeyStatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  keyRow: KeyRow | null;
}

export function KeyStatusChangeDialog({
  open,
  onOpenChange,
  buildingId,
  keyRow,
}: KeyStatusChangeDialogProps) {
  const { staff } = useAuthContext();
  const { requestDisable, cancelDisable } = useMutateKey(buildingId);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) setNote('');
  }, [open]);

  if (!keyRow) return null;

  const isRequestDisable = keyRow.status === 'active';
  const isCancelDisable = keyRow.status === 'pending_disable';

  if (!isRequestDisable && !isCancelDisable) return null;

  const mutation = isRequestDisable ? requestDisable : cancelDisable;
  const actionLabel = isRequestDisable ? 'Solicitar baja' : 'Cancelar baja';
  const trimmed = note.trim();
  const canConfirm = !mutation.isPending;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await mutation.mutateAsync({
      id: keyRow.id,
      note: trimmed || null,
      actor_staff_id: staff?.id ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {actionLabel}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{keyRow.rfid_code}</span>
            {' · '}
            Unidad {keyRow.unit.number}
            {keyRow.unit.is_administrative ? ' · administrativa' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="status-note">
            Motivo del cambio
          </Label>
          <Textarea
            id="status-note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isRequestDisable
                ? 'Ej: llave perdida por el propietario, no responde, cambio de propietario, etc.'
                : 'Ej: error al solicitar la baja, llave recuperada'
            }
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            Este motivo queda en el historial de la llave.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant={isRequestDisable ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {mutation.isPending ? 'Guardando...' : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
