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
import type { EquipmentRow } from '@/hooks/useEquipment';
import { EquipmentFormSheet } from './EquipmentFormSheet';
import { ReplaceEquipmentDialog } from './ReplaceEquipmentDialog';

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  dead: 'Dado de baja',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  maintenance: 'secondary',
  dead: 'destructive',
};

interface EquipmentTableProps {
  buildingId: string;
  equipment: EquipmentRow[];
}

export function EquipmentTable({ buildingId, equipment }: EquipmentTableProps) {
  const [editingEquipment, setEditingEquipment] = useState<EquipmentRow | null>(null);
  const [replacingEquipment, setReplacingEquipment] = useState<EquipmentRow | null>(null);

  if (equipment.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay equipos registrados.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nuevo equipo" para agregar el primero.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Modelo</TableHead>
            <TableHead>Número de serie</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Instalado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {equipment.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.model ?? '—'}</TableCell>
              <TableCell className="font-mono text-sm">{item.serial_number}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[item.status] ?? 'secondary'}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.installed_at
                  ? new Date(item.installed_at).toLocaleDateString('es-AR')
                  : '—'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingEquipment(item)}
                  >
                    Editar
                  </Button>
                  {item.status !== 'dead' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReplacingEquipment(item)}
                    >
                      Reemplazar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <EquipmentFormSheet
        open={Boolean(editingEquipment)}
        onOpenChange={(open) => {
          if (!open) setEditingEquipment(null);
        }}
        buildingId={buildingId}
        equipment={editingEquipment}
      />

      {replacingEquipment && (
        <ReplaceEquipmentDialog
          open={Boolean(replacingEquipment)}
          onOpenChange={(open) => {
            if (!open) setReplacingEquipment(null);
          }}
          equipment={replacingEquipment}
          buildingId={buildingId}
        />
      )}
    </>
  );
}
