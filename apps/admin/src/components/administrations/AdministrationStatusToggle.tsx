import { useState } from 'react';
import { Button } from '@vitalock/ui';
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

export function AdministrationStatusToggle({
  administration,
}: AdministrationStatusToggleProps) {
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
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={deactivateAdministration.isPending}
      >
        Desactivar
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasActiveBuildings ? 'No se puede desactivar' : 'Desactivar administración'}
            </DialogTitle>
            <DialogDescription>
              {hasActiveBuildings ? (
                <>
                  La administración <strong>{administration.company_name}</strong> tiene{' '}
                  {activeBuildings} edificio{activeBuildings !== 1 ? 's' : ''} activo{activeBuildings !== 1 ? 's' : ''}.
                  Desactivá los edificios primero.
                </>
              ) : (
                <>
                  ¿Confirmás que querés desactivar la administración{' '}
                  <strong>{administration.company_name}</strong>? Esta acción cambiará su
                  estado a inactivo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {hasActiveBuildings ? (
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Entendido
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleConfirm()}
                  disabled={deactivateAdministration.isPending}
                >
                  {deactivateAdministration.isPending ? 'Desactivando...' : 'Desactivar'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
