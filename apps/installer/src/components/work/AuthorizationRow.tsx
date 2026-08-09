import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMarkAuthorization } from '@/hooks/useMarkAuthorization';
import type { WorklistAuthorization } from '@/hooks/useWorklist';

interface AuthorizationRowProps {
  authorization: WorklistAuthorization;
}

/**
 * AuthorizationRow — single RFID authorization row.
 *
 * Two-step confirm pattern per design decision §Pessimistic mutations:
 *   1st tap  → button changes to "Confirmar"; for pending_removal rows,
 *              inline remove_reason textarea appears.
 *   2nd tap  → fires pessimistic mutation; per-row spinner blocks further
 *              interaction until DB confirms.
 *
 * Satisfies worklist R1, R2, R3.
 */
export function AuthorizationRow({ authorization }: AuthorizationRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const mark = useMarkAuthorization();

  const isPending = mark.isPending;
  const isInstall = authorization.sync_state === 'pending_install';

  function handleFirstTap() {
    setConfirming(true);
  }

  function handleConfirm() {
    if (isInstall) {
      mark.mutate({ authorizationId: authorization.id, kind: 'install' });
    } else {
      mark.mutate({
        authorizationId: authorization.id,
        kind: 'remove',
        remove_reason: removeReason.trim() || null,
      });
    }
  }

  const unit = authorization.rfid_key.unit;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      {/* Row info */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-mono font-medium">
            {authorization.rfid_key.rfid_code}
          </p>
          <p className="text-xs text-muted-foreground">
            Unidad {unit.number}
            {unit.unit_type ? ` · ${unit.unit_type}` : ''}
          </p>
        </div>

        {/* Action button */}
        {isPending ? (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Procesando…</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant={confirming ? 'destructive' : isInstall ? 'default' : 'destructive'}
            onClick={confirming ? handleConfirm : handleFirstTap}
            disabled={isPending}
          >
            {confirming ? 'Confirmar' : isInstall ? 'Cargar' : 'Borrar'}
          </Button>
        )}
      </div>

      {/* Inline remove_reason textarea — appears between 1st and 2nd tap for pending_removal */}
      {confirming && !isInstall && !isPending && (
        <Textarea
          placeholder="Motivo de baja (opcional)"
          value={removeReason}
          onChange={(e) => setRemoveReason(e.target.value)}
          className="text-sm"
          rows={2}
        />
      )}
    </div>
  );
}
