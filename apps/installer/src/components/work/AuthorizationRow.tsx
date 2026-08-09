import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRejectAuthorization } from '@/hooks/useRejectAuthorization';
import { RejectDialog } from './RejectDialog';
import type { WorklistAuthorization } from '@/hooks/useWorklist';

interface AuthorizationRowProps {
  authorization: WorklistAuthorization;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function AuthorizationRow({ authorization, selected, onToggle }: AuthorizationRowProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const reject = useRejectAuthorization();

  const isInstall = authorization.sync_state === 'pending_install';
  const unit = authorization.rfid_key.unit;

  const handleReject = (reason: string) => {
    reject.mutate(
      { id: authorization.id, sync_state: authorization.sync_state, reason },
      { onSuccess: () => setRejectOpen(false) },
    );
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-md border bg-background p-3">
        <Checkbox
          id={`auth-${authorization.id}`}
          checked={selected}
          onCheckedChange={() => onToggle(authorization.id)}
          disabled={reject.isPending}
        />

        <label
          htmlFor={`auth-${authorization.id}`}
          className="min-w-0 flex-1 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-mono font-medium">
              {authorization.rfid_key.rfid_code}
            </p>
            <Badge variant={isInstall ? 'default' : 'destructive'} className="text-xs">
              {isInstall ? 'Cargar' : 'Borrar'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Unidad {unit.number}
            {unit.unit_type ? ` · ${unit.unit_type}` : ''}
          </p>
        </label>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRejectOpen(true)}
          disabled={reject.isPending}
        >
          Rechazar
        </Button>
      </div>

      <RejectDialog
        open={rejectOpen}
        title="Rechazar llave"
        description={`RFID ${authorization.rfid_key.rfid_code} · Unidad ${unit.number}`}
        isPending={reject.isPending}
        onCancel={() => setRejectOpen(false)}
        onConfirm={handleReject}
      />
    </>
  );
}
