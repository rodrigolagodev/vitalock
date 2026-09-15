import { useState } from 'react';
import { Trash2, PencilLine } from 'lucide-react';
import {
  DataCardList,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vitalock/ui';
import { staffRole } from '@/lib/status/staffRole';
import { useMutateStaff } from '@/hooks/useMutateStaff';
import type { StaffRow } from '@/hooks/usePersonal';

interface StaffTableProps {
  rows: StaffRow[];
  isFetching: boolean;
  hasFilters?: boolean;
  onEdit?: (staff: StaffRow) => void;
}

/**
 * Card list of admin/installer staff. `full_name` is already a clean
 * identifier — no title swap. `Rol` (`StaffRole`) is the row's only
 * controlled-vocabulary field, so it is promoted to `card: 'status'`
 * (the header's badge slot) like every other view's Estado field.
 * Deliberately NO decorative `card: 'icon'`: with only 2 possible role
 * values already rendered as a distinct colored `staffRole.Badge` now
 * sitting in the most prominent header slot, a title icon would repeat a
 * signal the badge already carries — the same "skip where it's a stretch"
 * call as `EquipmentUpdateHistoryPanel` (Phase 3), just for a different
 * reason (redundant signal here vs. no type field there).
 */
export function StaffTable({ rows, isFetching, hasFilters = false, onEdit }: StaffTableProps) {
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

  return (
    <>
      <DataCardList<StaffRow>
        rows={rows}
        isFetching={isFetching}
        columns={[
          { header: 'Nombre', cell: (staff) => staff.full_name },
          {
            header: 'Usuario',
            cell: (staff) => staff.username,
            className: 'text-muted-foreground',
          },
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
            cell: (staff) => <staffRole.Badge status={staff.role} />,
            card: 'status',
          },
        ]}
        rowKey={(staff) => staff.id}
        renderActions={(staff) => (
          <div className="flex w-full items-center gap-2">
            {onEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                aria-label={`Editar a ${staff.full_name}`}
                onClick={() => onEdit(staff)}
              >
                <PencilLine className="h-4 w-4" />
                Editar
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive flex-1 gap-2"
              aria-label={`Dar de baja a ${staff.full_name}`}
              onClick={() => setDeactivating(staff)}
            >
              <Trash2 className="h-4 w-4" />
              Dar de baja
            </Button>
          </div>
        )}
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
