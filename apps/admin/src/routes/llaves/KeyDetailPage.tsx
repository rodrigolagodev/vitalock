import { Link, useParams } from 'react-router-dom';
import {
  Card,
  EmptyState,
  ErrorState,
  NotFoundState,
  SectionHeading,
  Skeleton,
} from '@vitalock/ui';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@vitalock/ui';
import { useKeyById } from '@/hooks/useKeyById';
import { useKeyEvents, type KeyEventRow } from '@/hooks/useKeyEvents';
import { keyStatus } from '@/lib/status/keyStatus';
import { keyOrderStatus } from '@/lib/status/keyOrderStatus';
import { keyItemStatus } from '@/lib/status/keyItemStatus';

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
  disable_requested: 'bg-warning',
  disable_cancelled: 'bg-primary',
  disabled: 'bg-destructive',
  snapshot_skipped: 'bg-muted-foreground',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default function KeyDetailPage() {
  const { keyId } = useParams<{ keyId: string }>();
  const { data: keyDetail, isLoading, isError, refetch } = useKeyById(keyId);
  const { data: events = [], isLoading: eventsLoading } = useKeyEvents(keyId);

  if (isLoading) {
    return (
      <div role="status" aria-label="Cargando llave" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message="No se pudo cargar la información de la llave."
        className="gap-4 py-16"
        onRetry={() => void refetch()}
        back={{ label: 'Volver al inventario', to: '/llaves/inventario' }}
      />
    );
  }

  if (!keyDetail) {
    return (
      <NotFoundState
        message="Llave no encontrada."
        back={{ label: 'Volver al inventario', to: '/llaves/inventario' }}
      />
    );
  }

  const pickedUpFullName = [keyDetail.picked_up_by_name, keyDetail.picked_up_by_surname]
    .filter(Boolean)
    .join(' ');

  const unitDescription = [
    `Unidad ${keyDetail.unit.number}`,
    keyDetail.unit.unit_type,
    keyDetail.unit.is_administrative ? 'administrativa' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const isInformational =
    keyDetail.status === 'pending_creation' || keyDetail.status === 'pending_installation';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={keyDetail.rfid_code}
        titleClassName="font-mono"
        breadcrumbs={[
          { label: 'Inventario de llaves', to: '/llaves/inventario' },
          { label: keyDetail.rfid_code },
        ]}
        titleAdornment={<keyStatus.Badge status={keyDetail.status} />}
      />

      {/* Contextual notes */}
      {isInformational && (
        <p className="bg-muted text-muted-foreground rounded px-3 py-2 text-sm">
          {keyDetail.status === 'pending_creation'
            ? 'Esta llave está siendo configurada. Podrá instalarse una vez lista.'
            : 'Esta llave está lista para instalarse en el equipo.'}
        </p>
      )}

      {keyDetail.status === 'pending_disable' && (
        <p className="bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning rounded px-3 py-2 text-sm">
          Se solicitó la baja de esta llave. Puede cancelarse antes de que el técnico resuelva la
          tarea.
        </p>
      )}

      {/* 2-column grid on desktop, single column on mobile */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <SectionHeading title="Ubicación" />
          <Row
            label="Administración"
            value={
              keyDetail.unit.building?.administration ? (
                <Link
                  to={`/administraciones/${keyDetail.unit.building.administration.id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {keyDetail.unit.building.administration.company_name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <Row
            label="Edificio"
            value={
              keyDetail.unit.building ? (
                <Link
                  to={`/buildings/${keyDetail.unit.building.id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {keyDetail.unit.building.name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <Row label="Unidad" value={unitDescription} />
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <SectionHeading title="Custodia" />
          <Row
            label="Retirada por"
            value={pickedUpFullName || <span className="text-muted-foreground">Sin retirar</span>}
          />
          <Row label="DNI" value={keyDetail.picked_up_by_dni ?? '—'} />
          <Row label="Fecha de retiro" value={formatDateTime(keyDetail.picked_up_at)} />
          <Row
            label="Entregada por"
            value={
              keyDetail.delivered_by?.full_name ?? <span className="text-muted-foreground">—</span>
            }
          />
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <SectionHeading title="Equipos autorizados" />
          {keyDetail.authorized_equipment.length === 0 ? (
            <EmptyState message="Sin equipos autorizados." />
          ) : (
            <ul className="flex flex-col gap-2">
              {keyDetail.authorized_equipment.map((eq) => (
                <li key={eq.authorization_id} className="text-sm">
                  <Link
                    to={`/equipos/${eq.equipment_id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {eq.model ? `${eq.model} · ` : ''}
                    <span className="font-mono">{eq.serial_number}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <SectionHeading title="Ciclo de vida" />
          <Row label="Creada" value={formatDateTime(keyDetail.activated_at)} />
          {keyDetail.deactivated_at && (
            <Row label="Dada de baja" value={formatDateTime(keyDetail.deactivated_at)} />
          )}
        </Card>
      </div>

      {/* Full width sections below */}
      <Card className="flex flex-col gap-3 p-4">
        <SectionHeading title="Órdenes asociadas" />
        {keyDetail.associated_orders.length === 0 ? (
          <EmptyState message="No hay órdenes vinculadas a esta llave." />
        ) : (
          <ul className="flex flex-col gap-3">
            {keyDetail.associated_orders.map((o) => (
              <li
                key={o.key_order_id}
                className="border-border/60 flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    to={`/llaves/${o.key_order_id}`}
                    className="text-primary font-medium underline-offset-2 hover:underline"
                  >
                    {o.order_number}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(o.order_created_at)}
                  </span>
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                  <span>Orden: {keyOrderStatus.label(o.order_status)}</span>
                  <span>·</span>
                  <span>Ítem: {keyItemStatus.label(o.item_status)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <SectionHeading title="Historial" />
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex gap-3">
            <span className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="font-medium">Creada</span>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(keyDetail.activated_at)}
                </span>
              </div>
            </div>
          </div>

          {eventsLoading && <p className="text-muted-foreground text-xs">Cargando eventos…</p>}

          {!eventsLoading && events.length === 0 && (
            <EmptyState message="Sin cambios de estado registrados." className="pl-5 text-xs" />
          )}

          {events.map((e) => (
            <div key={e.id} className="flex gap-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_DOT_CLASS[e.event_type]}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{EVENT_LABEL[e.event_type]}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(e.occurred_at)}
                  </span>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap text-xs">{e.note}</p>
                {e.actor_name && (
                  <p className="text-muted-foreground mt-0.5 text-xs">Por {e.actor_name}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {keyDetail.notes && (
        <Card className="flex flex-col gap-3 p-4">
          <SectionHeading title="Notas" />
          <p className="whitespace-pre-wrap text-sm">{keyDetail.notes}</p>
        </Card>
      )}
    </div>
  );
}
