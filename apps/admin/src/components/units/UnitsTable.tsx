import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { UnitFormSheet } from './UnitFormSheet';
import { useMutateUnit } from '@/hooks/useMutateUnit';
import type { UnitRow } from '@/hooks/useUnits';

interface UnitsTableProps {
  buildingId: string;
  units: UnitRow[];
}

export function UnitsTable({ buildingId, units }: UnitsTableProps) {
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const { deactivateUnit } = useMutateUnit(buildingId);

  if (units.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay unidades registradas.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nueva unidad" para agregar la primera.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Administrativa</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => (
            <TableRow key={unit.id}>
              <TableCell className="font-medium">{unit.number}</TableCell>
              <TableCell>
                <Badge
                  variant={unit.status === 'active' ? 'default' : 'secondary'}
                >
                  {unit.status === 'active' ? 'Activa' : 'Inactiva'}
                </Badge>
              </TableCell>
              <TableCell>
                {unit.is_administrative ? (
                  <Badge variant="outline">Sí</Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">No</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingUnit(unit)}
                  >
                    Editar
                  </Button>
                  {unit.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deactivateUnit.isPending}
                      onClick={() =>
                        deactivateUnit.mutate({ id: unit.id, building_id: buildingId })
                      }
                    >
                      Desactivar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <UnitFormSheet
        open={Boolean(editingUnit)}
        onOpenChange={(open) => {
          if (!open) setEditingUnit(null);
        }}
        buildingId={buildingId}
        unit={editingUnit}
      />
    </>
  );
}
