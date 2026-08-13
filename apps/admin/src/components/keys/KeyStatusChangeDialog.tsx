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
import { useAuthContext } from '@/auth/AuthProvider';
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
  const { changeStatus } = useMutateKey(buildingId);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) setNote('');
  }, [open]);

  if (!keyRow) return null;

  const targetStatus: 'active' | 'disabled' =
    keyRow.status === 'active' ? 'disabled' : 'active';
  const actionLabel = targetStatus === 'active' ? 'Activar' : 'Dar de baja';
  const trimmed = note.trim();
  const canConfirm = !changeStatus.isPending;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await changeStatus.mutateAsync({
      id: keyRow.id,
      status: targetStatus,
      note: trimmed,
      actor_staff_id: staff?.id ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !changeStatus.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {actionLabel} llave
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
              targetStatus === 'disabled'
                ? 'Ej: llave perdida por el propietario, no responde, cambio de propietario, etc.'
                : 'Ej: llave reactivada tras reemplazo de tarjeta'
            }
            disabled={changeStatus.isPending}
          />
          <p className="text-xs text-muted-foreground">
            Este motivo queda en el historial de la llave.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={changeStatus.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant={targetStatus === 'disabled' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {changeStatus.isPending ? 'Guardando...' : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
