import { useState } from 'react';
import { Power } from 'lucide-react';
import { Button, ConfirmDialog, cn } from '@vitalock/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@vitalock/ui';
import { useBuildings } from '@/hooks/useBuildings';
import { useMutateAdministration } from '@/hooks/useMutateAdministration';
import type { AdministrationRow } from '@/hooks/useAdministrations';

interface AdministrationStatusToggleProps {
  administration: Pick<AdministrationRow, 'id' | 'company_name' | 'status'>;
}

export function AdministrationStatusToggle({ administration }: AdministrationStatusToggleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: buildings = [] } = useBuildings({ administrationId: administration.id });
  const { deactivateAdministration } = useMutateAdministration();

  if (administration.status !== 'active') {
    return null;
  }

  const activeBuildings = buildings.filter((b) => b.status === 'active').length;
  const hasActiveBuildings = activeBuildings > 0;

  const handleClick = () => {
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    await deactivateAdministration.mutateAsync({ id: administration.id });
    setDialogOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive flex-1 gap-2"
        aria-label={`Desactivar ${administration.company_name}`}
        onClick={handleClick}
        disabled={deactivateAdministration.isPending}
      >
        <Power className={cn('h-4 w-4', deactivateAdministration.isPending && 'animate-pulse')} />
        Desactivar
      </Button>

      {hasActiveBuildings ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>No se puede desactivar</DialogTitle>
              <DialogDescription>
                La administración <strong>{administration.company_name}</strong> tiene{' '}
                {activeBuildings} edificio{activeBuildings !== 1 ? 's' : ''} activo
                {activeBuildings !== 1 ? 's' : ''}. Desactivá los edificios primero.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Entendido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Desactivar administración"
          description={
            <>
              ¿Confirmás que querés desactivar la administración{' '}
              <strong>{administration.company_name}</strong>? Esta acción cambiará su estado a
              inactivo.
            </>
          }
          confirmLabel="Desactivar"
          pendingLabel="Desactivando..."
          variant="destructive"
          isPending={deactivateAdministration.isPending}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </>
  );
}
