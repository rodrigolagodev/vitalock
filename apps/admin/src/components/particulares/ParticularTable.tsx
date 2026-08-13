import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@vitalock/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vitalock/ui';
import { useMutateParticular } from '@/hooks/useMutateParticular';
import type { ParticularRow } from '@/hooks/useParticulares';

function formatUnit(row: ParticularRow): string {
  if (!row.unit_number) return '—';
  return row.building_name
    ? `Unidad ${row.unit_number} — ${row.building_name}`
    : `Unidad ${row.unit_number}`;
}

interface ParticularTableProps {
  rows: ParticularRow[];
  isFetching: boolean;
  hasFilters?: boolean;
  onEdit?: (particular: ParticularRow) => void;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-32 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

export function ParticularTable({
  rows,
  isFetching,
  hasFilters = false,
  onEdit,
}: ParticularTableProps) {
  const [deactivating, setDeactivating] = useState<ParticularRow | null>(null);
  const { deactivateParticular } = useMutateParticular();

  const handleConfirmDeactivate = async () => {
    if (!deactivating) return;
    try {
      await deactivateParticular.mutateAsync({ id: deactivating.id });
      setDeactivating(null);
    } catch {
      // The mutation's onError already surfaces the error toast.
    }
  };

  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>DNI</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </TableBody>
      </Table>
    );
  }

  if (rows.length === 0 && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay particulares registrados.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nuevo particular".
        </p>
      </div>
    );
  }

  if (rows.length === 0 && hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron particulares con los filtros aplicados.
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
            <TableHead>DNI</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((particular) => (
            <TableRow key={particular.id}>
              <TableCell className="font-medium">{particular.full_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {particular.dni}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {particular.phone ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {particular.email ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatUnit(particular)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {onEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(particular)}
                    >
                      Editar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Dar de baja a ${particular.full_name}`}
                    onClick={() => setDeactivating(particular)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deactivating ? `¿Dar de baja a ${deactivating.full_name}?` : ''}
            </DialogTitle>
            <DialogDescription>
              El registro se conserva pero deja de aparecer y no puede vincularse a
              nuevas órdenes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivating(null)}
              disabled={deactivateParticular.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={deactivateParticular.isPending}
            >
              {deactivateParticular.isPending ? 'Dando de baja...' : 'Dar de baja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
