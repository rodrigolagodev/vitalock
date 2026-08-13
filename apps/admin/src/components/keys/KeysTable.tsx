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
import { KeyStatusChangeDialog } from './KeyStatusChangeDialog';
import { KeyDetailDialog } from './KeyDetailDialog';
import type { KeyRow } from '@/hooks/useKeys';

interface KeysTableProps {
  keys: KeyRow[];
  buildingId: string;
  isFetching?: boolean;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-36 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-20 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell className="text-right"><div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
}

const STATUS_LABEL: Record<KeyRow['status'], string> = {
  active: 'Activa',
  disabled: 'Dada de baja',
};

export function KeysTable({ keys, buildingId, isFetching = false }: KeysTableProps) {
  const [changingStatusFor, setChangingStatusFor] = useState<KeyRow | null>(null);
  const [detail, setDetail] = useState<KeyRow | null>(null);

  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>RFID</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Activada</TableHead>
            <TableHead>Retirada por</TableHead>
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

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay llaves registradas.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Las llaves se crean a través de una orden.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>RFID</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Activada</TableHead>
            <TableHead>Retirada por</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => (
            <TableRow key={k.id}>
              <TableCell className="font-mono text-sm">
                <button
                  type="button"
                  onClick={() => setDetail(k)}
                  className="text-left hover:underline"
                >
                  {k.rfid_code}
                </button>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{k.unit.number}</span>
                  {k.unit.unit_type && (
                    <span className="text-xs text-muted-foreground">
                      · {k.unit.unit_type}
                    </span>
                  )}
                  {k.unit.is_administrative && (
                    <Badge variant="secondary" className="text-xs">Admin</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={k.status === 'active' ? 'default' : 'secondary'}>
                  {STATUS_LABEL[k.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {fmtDate(k.activated_at)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {k.picked_up_by_name || k.picked_up_by_surname
                  ? `${k.picked_up_by_name ?? ''} ${k.picked_up_by_surname ?? ''}`.trim()
                  : '—'}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant={k.status === 'active' ? 'destructive' : 'default'}
                  onClick={() => setChangingStatusFor(k)}
                >
                  {k.status === 'active' ? 'Dar de baja' : 'Activar'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <KeyStatusChangeDialog
        open={Boolean(changingStatusFor)}
        onOpenChange={(o) => !o && setChangingStatusFor(null)}
        buildingId={buildingId}
        keyRow={changingStatusFor}
      />

      <KeyDetailDialog
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        keyRow={detail}
      />
    </>
  );
}
