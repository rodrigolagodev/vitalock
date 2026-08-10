import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TareaStatusBadge } from './TareaStatusBadge';
import type { TareaRow } from '@/hooks/useTareas';

interface TareasTableProps {
  rows: TareaRow[];
  isFetching: boolean;
  hasFilters: boolean;
  onEdit?: (tarea: TareaRow) => void;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-36 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-20 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-12 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

const CATEGORY_LABELS: Record<TareaRow['category'], string> = {
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function TareasTable({
  rows,
  isFetching,
  hasFilters,
  onEdit,
}: TareasTableProps) {
  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket</TableHead>
            <TableHead>Edificio</TableHead>
            <TableHead>Asignado a</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Abierta</TableHead>
            <TableHead className="text-right">Acción</TableHead>
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
        <p className="text-sm text-muted-foreground">No hay tareas registradas.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nueva tarea".
        </p>
      </div>
    );
  }

  if (rows.length === 0 && hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron tareas con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticket</TableHead>
          <TableHead>Edificio</TableHead>
          <TableHead>Asignado a</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Abierta</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((tarea) => (
          <TableRow key={tarea.id}>
            <TableCell>
              <div className="font-medium">{tarea.ticket_number}</div>
              <p className="line-clamp-1 text-sm text-muted-foreground">
                {tarea.description}
              </p>
            </TableCell>
            <TableCell>
              <div className="text-sm">{tarea.building?.name ?? '—'}</div>
              {tarea.building?.administration?.company_name != null && (
                <p className="text-xs text-muted-foreground">
                  {tarea.building.administration.company_name}
                </p>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {tarea.assigned_to_name ?? 'Sin asignar'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {CATEGORY_LABELS[tarea.category]}
            </TableCell>
            <TableCell>
              <TareaStatusBadge status={tarea.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(tarea.opened_at)}
            </TableCell>
            <TableCell className="text-right">
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(tarea)}
                >
                  Editar
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
