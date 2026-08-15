import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { BuildingFormSheet } from './BuildingFormSheet';
import { BuildingStatusToggle } from './BuildingStatusToggle';
import type { BuildingRow } from '@/hooks/useBuildings';

interface BuildingsTableProps {
  buildings: BuildingRow[];
  /** When true, replaces rows with 3 skeleton placeholders */
  isFetching?: boolean;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-32 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell className="text-center"><div className="mx-auto h-4 w-8 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell className="text-center"><div className="mx-auto h-4 w-8 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell className="text-right"><div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

export function BuildingsTable({ buildings, isFetching = false }: BuildingsTableProps) {
  const [editingBuilding, setEditingBuilding] = useState<BuildingRow | null>(null);

  if (isFetching) {
    return (
      <div className="overflow-hidden rounded-[12px] border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-center">Llaves</TableHead>
            <TableHead className="text-center">Equipos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </TableBody>
      </Table>
      </div>
    );
  }

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
      <div className="overflow-hidden rounded-[12px] border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-center">Llaves</TableHead>
            <TableHead className="text-center">Equipos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buildings.map((building) => (
            <TableRow key={building.id}>
              <TableCell className="font-medium">
                <Link
                  to={`/buildings/${building.id}`}
                  className="hover:underline"
                >
                  {building.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {building.address ?? '—'}
              </TableCell>
              <TableCell>
                <StatusBadge
                  tone={building.status === 'active' ? 'success' : 'neutral'}
                >
                  {building.status === 'active' ? 'Activo' : 'Inactivo'}
                </StatusBadge>
              </TableCell>
              <TableCell className="text-center">{building.key_count}</TableCell>
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
      </div>

      <BuildingFormSheet
        open={Boolean(editingBuilding)}
        onOpenChange={(open) => {
          if (!open) setEditingBuilding(null);
        }}
        building={editingBuilding}
      />
    </>
  );
}
