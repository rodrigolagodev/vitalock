import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { useKeyEvents } from '@/hooks/useKeyEvents';
import type { KeyRow } from '@/hooks/useKeys';
import type { KeyEventRow } from '@/hooks/useKeyEvents';

interface KeyDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyRow: KeyRow | null;
}

const STATUS_LABEL: Record<KeyRow['status'], string> = {
  pending_creation: 'En creación',
  pending_installation: 'Pendiente de instalación',
  active: 'Activa',
  pending_disable: 'Baja solicitada',
  disabled: 'Dada de baja',
};

const STATUS_VARIANT: Record<
  KeyRow['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_creation: 'secondary',
  pending_installation: 'outline',
  active: 'default',
  pending_disable: 'outline',
  disabled: 'secondary',
};

const EVENT_LABEL: Record<KeyEventRow['event_type'], string> = {
  activated: 'Activada',
  deactivated: 'Dada de baja',
  creation_requested: 'Creación solicitada',
  configured: 'Configurada',
  disable_requested: 'Baja solicitada',
  disable_cancelled: 'Baja cancelada',
  disabled: 'Deshabilitada',
  snapshot_skipped: 'Omitida en actualización',
};

const EVENT_DOT_CLASS: Record<KeyEventRow['event_type'], string> = {
  activated: 'bg-primary',
  deactivated: 'bg-muted-foreground',
  creation_requested: 'bg-muted-foreground',
  configured: 'bg-primary',
  disable_requested: 'bg-yellow-500',
  disable_cancelled: 'bg-primary',
  disabled: 'bg-destructive',
  snapshot_skipped: 'bg-muted-foreground',
};

function fmt(iso: string | null | undefined): string {
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

export function KeyDetailDialog({ open, onOpenChange, keyRow }: KeyDetailDialogProps) {
  const { data: events = [], isLoading: eventsLoading } = useKeyEvents(
    open ? keyRow?.id : undefined,
  );

  if (!keyRow) return null;

  const pickedUpFullName = [keyRow.picked_up_by_name, keyRow.picked_up_by_surname]
    .filter(Boolean)
    .join(' ');

  const isInformational =
    keyRow.status === 'pending_creation' || keyRow.status === 'pending_installation';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">{keyRow.rfid_code}</DialogTitle>
          <DialogDescription>
            Unidad {keyRow.unit.number}
            {keyRow.unit.unit_type ? ` · ${keyRow.unit.unit_type}` : ''}
            {keyRow.unit.is_administrative ? ' · administrativa' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Row
            label="Estado"
            value={
              <Badge variant={STATUS_VARIANT[keyRow.status]}>
                {STATUS_LABEL[keyRow.status]}
              </Badge>
            }
          />

          {isInformational && (
            <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
              {keyRow.status === 'pending_creation'
                ? 'Esta llave está siendo configurada. Podrá instalarse una vez lista.'
                : 'Esta llave está lista para instalarse en el equipo.'}
            </p>
          )}

          {keyRow.status === 'pending_disable' && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-2 py-1">
              Se solicitó la baja de esta llave. Puede cancelarse antes de que el técnico resuelva la tarea.
            </p>
          )}

          <hr className="border-border" />

          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Retiro
          </p>
          <Row label="Fecha" value={fmt(keyRow.picked_up_at)} />
          <Row label="Retirada por" value={pickedUpFullName || '—'} />
          <Row label="DNI" value={keyRow.picked_up_by_dni ?? '—'} />

          <hr className="border-border" />

          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Historial
          </p>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex gap-3">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">Creada</span>
                  <span className="text-xs text-muted-foreground">{fmt(keyRow.activated_at)}</span>
                </div>
              </div>
            </div>

            {eventsLoading && (
              <p className="text-xs text-muted-foreground">Cargando eventos…</p>
            )}

            {!eventsLoading && events.length === 0 && (
              <p className="text-xs text-muted-foreground pl-5">
                Sin cambios de estado registrados.
              </p>
            )}

            {events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <span
                  className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${EVENT_DOT_CLASS[e.event_type]}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{EVENT_LABEL[e.event_type]}</span>
                    <span className="text-xs text-muted-foreground">{fmt(e.occurred_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.note}</p>
                  {e.actor_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">Por {e.actor_name}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {keyRow.notes && (
            <>
              <hr className="border-border" />
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Notas
              </p>
              <p className="whitespace-pre-wrap text-sm">{keyRow.notes}</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
