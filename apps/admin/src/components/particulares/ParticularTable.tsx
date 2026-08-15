import { useState } from 'react';
import { Trash2, PencilLine } from 'lucide-react';
import {
  DataTable,
  Button,
  type DataTableAction,
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

  const actions: DataTableAction<ParticularRow>[] = [];
  if (onEdit) {
    actions.push({
      icon: PencilLine,
      label: (particular) => `Editar a ${particular.full_name}`,
      onClick: (particular) => onEdit(particular),
    });
  }
  actions.push({
    icon: Trash2,
    label: (particular) => `Dar de baja a ${particular.full_name}`,
    onClick: (particular) => setDeactivating(particular),
    className: 'text-destructive hover:text-destructive',
  });

  return (
    <>
      <DataTable<ParticularRow>
        rows={rows}
        isFetching={isFetching}
        columns={[
          { header: 'Nombre', cell: (particular) => particular.full_name },
          {
            header: 'DNI',
            cell: (particular) => particular.dni,
            className: 'text-muted-foreground',
          },
          {
            header: 'Teléfono',
            cell: (particular) => particular.phone ?? '—',
            className: 'text-muted-foreground',
          },
          {
            header: 'Email',
            cell: (particular) => particular.email ?? '—',
            className: 'text-muted-foreground',
          },
          {
            header: 'Unidad',
            cell: (particular) => formatUnit(particular),
            className: 'text-muted-foreground',
          },
        ]}
        rowKey={(particular) => particular.id}
        actions={actions}
        emptyMessage="No hay particulares registrados."
        filteredEmptyMessage="No se encontraron particulares con los filtros aplicados."
        hasFilters={hasFilters}
      />

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
