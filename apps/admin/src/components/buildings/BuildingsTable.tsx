import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuildingFormSheet } from './BuildingFormSheet';
import { BuildingStatusToggle } from './BuildingStatusToggle';
import type { BuildingRow } from '@/hooks/useBuildings';

interface BuildingsTableProps {
  buildings: BuildingRow[];
  administrationId?: string;
}

export function BuildingsTable({ buildings, administrationId = '' }: BuildingsTableProps) {
  const [editingBuilding, setEditingBuilding] = useState<BuildingRow | null>(null);

  if (buildings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay edificios registrados.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nuevo edificio" para agregar el primero.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-center">Unidades</TableHead>
            <TableHead className="text-center">Equipos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buildings.map((building) => (
            <TableRow key={building.id}>
              <TableCell className="font-medium">{building.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {building.address ?? '—'}
              </TableCell>
              <TableCell>
                <Badge
                  variant={building.status === 'active' ? 'default' : 'secondary'}
                >
                  {building.status === 'active' ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell className="text-center">{building.unit_count}</TableCell>
              <TableCell className="text-center">{building.equipment_count}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingBuilding(building)}
                  >
                    Editar
                  </Button>
                  <BuildingStatusToggle building={building} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <BuildingFormSheet
        open={Boolean(editingBuilding)}
        onOpenChange={(open) => {
          if (!open) setEditingBuilding(null);
        }}
        building={editingBuilding}
        administrationId={administrationId}
      />
    </>
  );
}
