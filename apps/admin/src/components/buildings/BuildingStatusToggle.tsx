import { useState } from 'react';
import { Power } from 'lucide-react';
import { Button } from '@vitalock/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@vitalock/ui';
import { useUnits } from '@/hooks/useUnits';
import { useEquipment } from '@/hooks/useEquipment';
import { useMutateBuilding } from '@/hooks/useMutateBuilding';
import type { BuildingRow } from '@/hooks/useBuildings';

interface BuildingStatusToggleProps {
  building: Pick<BuildingRow, 'id' | 'name' | 'status'>;
}

export function BuildingStatusToggle({ building }: BuildingStatusToggleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: units = [] } = useUnits(building.id);
  const { data: equipment = [] } = useEquipment(building.id);
  const { deactivateBuilding } = useMutateBuilding();

  if (building.status !== 'active') {
    return null;
  }

  const activeUnits = units.filter((u) => u.status === 'active').length;
  const activeEquipment = equipment.filter((e) => e.status === 'active').length;
  const hasActiveChildren = activeUnits > 0 || activeEquipment > 0;

  const handleClick = () => {
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    await deactivateBuilding.mutateAsync({ id: building.id });
    setDialogOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Desactivar ${building.name}`}
        onClick={handleClick}
        disabled={deactivateBuilding.isPending}
      >
        <Power className="h-4 w-4" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasActiveChildren ? 'No se puede desactivar' : 'Desactivar edificio'}
            </DialogTitle>
            <DialogDescription>
              {hasActiveChildren ? (
                <>
                  El edificio <strong>{building.name}</strong> tiene dependencias activas
                  que deben desactivarse primero:
                  {activeUnits > 0 && (
                    <span className="block mt-1">
                      • {activeUnits} unidad{activeUnits !== 1 ? 'es' : ''} activa{activeUnits !== 1 ? 's' : ''}
                    </span>
                  )}
                  {activeEquipment > 0 && (
                    <span className="block mt-1">
                      • {activeEquipment} equipo{activeEquipment !== 1 ? 's' : ''} activo{activeEquipment !== 1 ? 's' : ''}
                    </span>
                  )}
                </>
              ) : (
                <>
                  ¿Confirmás que querés desactivar el edificio{' '}
                  <strong>{building.name}</strong>? Esta acción cambiará su estado a
                  inactivo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {hasActiveChildren ? (
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
                  disabled={deactivateBuilding.isPending}
                >
                  {deactivateBuilding.isPending ? 'Desactivando...' : 'Desactivar'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
