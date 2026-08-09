import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface RejectDialogProps {
  open: boolean;
  title: string;
  description?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function RejectDialog({
  open,
  title,
  description,
  isPending = false,
  onCancel,
  onConfirm,
}: RejectDialogProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const canConfirm = trimmed.length > 0 && !isPending;

  const handleCancel = () => {
    setReason('');
    onCancel();
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(trimmed);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="reject-reason" className="text-sm font-medium">
            Motivo del rechazo
          </label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: la RFID no responde, unidad inaccesible, etc."
            rows={4}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canConfirm}>
            {isPending ? 'Rechazando...' : 'Rechazar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
