import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useOrderKeyDetails } from '@/hooks/useOrderKeyDetails';
import type { OrderItemRow } from '@/hooks/useOrden';

interface KeyItemDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order item whose produced key is being inspected. */
  item: OrderItemRow;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/**
 * Read-only detail view for a configured order key. Aggregates RFID code,
 * unit + building, authorized equipment, item-level authorized retirer, and
 * pickup state. Query runs lazily (only while the dialog is open).
 */
export function KeyItemDetailsDialog({
  open,
  onOpenChange,
  item,
}: KeyItemDetailsDialogProps) {
  const keyId = open ? item.produced_key_id : null;
  const { data, isLoading, isError } = useOrderKeyDetails(keyId);

  const pickup = item.pickup_particulares;
  const pickedUpFullName = data
    ? [data.picked_up_by_name, data.picked_up_by_surname].filter(Boolean).join(' ')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">
            {data?.rfid_code ?? 'Llave'}
          </DialogTitle>
          <DialogDescription>Detalle de la llave configurada</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            No se pudieron cargar los detalles de la llave.
          </p>
        )}

        {data && (
          <div className="flex flex-col gap-3">
            <Row label="Código RFID" value={<span className="font-mono">{data.rfid_code}</span>} />
            <Row
              label="Edificio"
              value={data.unit?.building?.name ?? '—'}
            />
            <Row
              label="Unidad"
              value={
                data.unit
                  ? `${data.unit.number}${data.unit.unit_type ? ` — ${data.unit.unit_type}` : ''}${
                      data.unit.is_administrative ? ' · administrativa' : ''
                    }`
                  : '—'
              }
            />

            <hr className="border-border" />

            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Equipos autorizados
            </p>
            {data.authorizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin equipos autorizados.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.authorizations.map((auth) => (
                  <li key={auth.id} className="text-sm">
                    {auth.equipment
                      ? `${auth.equipment.serial_number}${
                          auth.equipment.model ? ` — ${auth.equipment.model}` : ''
                        }`
                      : '—'}
                  </li>
                ))}
              </ul>
            )}

            <hr className="border-border" />

            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Retiro
            </p>
            <Row
              label="Autorizado"
              value={
                pickup
                  ? `${pickup.full_name} (DNI ${pickup.dni})`
                  : <span className="text-muted-foreground">—</span>
              }
            />
            <Row
              label="Estado"
              value={
                data.picked_up_at ? (
                  <Badge>Retirada</Badge>
                ) : (
                  <Badge variant="secondary">Pendiente de retiro</Badge>
                )
              }
            />
            {data.picked_up_at && (
              <>
                <Row label="Fecha" value={formatDate(data.picked_up_at)} />
                <Row label="Retirada por" value={pickedUpFullName || '—'} />
                <Row label="DNI" value={data.picked_up_by_dni ?? '—'} />
              </>
            )}

            <hr className="border-border" />

            <Row label="Creada" value={formatDate(data.activated_at)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
