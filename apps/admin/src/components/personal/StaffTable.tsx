import { useState } from 'react';
import { Trash2, PencilLine } from 'lucide-react';
import {
  DataTable,
  Badge,
  Button,
  type DataTableAction,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vitalock/ui';
import { useMutateStaff } from '@/hooks/useMutateStaff';
import type { StaffRow } from '@/hooks/usePersonal';

const ROLE_LABELS: Record<StaffRow['role'], string> = {
  admin: 'Admin',
  installer: 'Instalador',
};

interface StaffTableProps {
  rows: StaffRow[];
  isFetching: boolean;
  hasFilters?: boolean;
  onEdit?: (staff: StaffRow) => void;
}

export function StaffTable({
  rows,
  isFetching,
  hasFilters = false,
  onEdit,
}: StaffTableProps) {
  const [deactivating, setDeactivating] = useState<StaffRow | null>(null);
  const { deactivateStaff } = useMutateStaff();

  const handleConfirmDeactivate = async () => {
    if (!deactivating) return;
    try {
      await deactivateStaff.mutateAsync({ id: deactivating.id });
      setDeactivating(null);
    } catch {
      // The mutation's onError already surfaces the error toast.
    }
  };

  const actions: DataTableAction<StaffRow>[] = [];
  if (onEdit) {
    actions.push({
      icon: PencilLine,
      label: (staff) => `Editar a ${staff.full_name}`,
      onClick: (staff) => onEdit(staff),
    });
  }
  actions.push({
    icon: Trash2,
    label: (staff) => `Dar de baja a ${staff.full_name}`,
    onClick: (staff) => setDeactivating(staff),
    className: 'text-destructive hover:text-destructive',
  });

  return (
    <>
      <DataTable<StaffRow>
        rows={rows}
        isFetching={isFetching}
        columns={[
          { header: 'Nombre', cell: (staff) => staff.full_name },
          {
            header: 'Email',
            cell: (staff) => staff.email ?? '—',
            className: 'text-muted-foreground',
          },
          {
            header: 'Teléfono',
            cell: (staff) => staff.phone ?? '—',
            className: 'text-muted-foreground',
          },
          {
            header: 'Rol',
            cell: (staff) => (
              <Badge variant="secondary">{ROLE_LABELS[staff.role]}</Badge>
            ),
          },
        ]}
        rowKey={(staff) => staff.id}
        actions={actions}
        emptyMessage="No hay personal registrado."
        filteredEmptyMessage="No se encontró personal con los filtros aplicados."
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
              El registro se conserva pero deja de aparecer y pierde acceso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivating(null)}
              disabled={deactivateStaff.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={deactivateStaff.isPending}
            >
              {deactivateStaff.isPending ? 'Dando de baja...' : 'Dar de baja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
