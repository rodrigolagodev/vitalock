import { useState } from 'react';
import { Trash2, PencilLine } from 'lucide-react';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
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

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-32 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-20 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
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

  if (isFetching) {
    return (
      <div className="overflow-hidden rounded-[12px] border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Rol</TableHead>
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

  if (rows.length === 0 && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay personal registrado.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nuevo personal".
        </p>
      </div>
    );
  }

  if (rows.length === 0 && hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontró personal con los filtros aplicados.
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
            <TableHead>Email</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((staff) => (
            <TableRow key={staff.id}>
              <TableCell className="font-medium">{staff.full_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {staff.email ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {staff.phone ?? '—'}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{ROLE_LABELS[staff.role]}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {onEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => onEdit(staff)}
                    >
                      <PencilLine className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Dar de baja a ${staff.full_name}`}
                    onClick={() => setDeactivating(staff)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

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
