import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  NotFoundState,
  PageHeader,
  SectionHeading,
  Skeleton,
} from '@vitalock/ui';
import { supabase } from '@/lib/supabase';
import { useMdbDownload } from '@vitalock/shared';
import { useTicket } from '@/hooks/useTicket';
import { useResolveEquipmentUpdate } from '@/hooks/useResolveEquipmentUpdate';
import { useResolveTickets } from '@/hooks/useResolveTickets';
import { useRfidKeyCodeMap } from '@/hooks/useRfidKeyCodeMap';
import { useTicketComments } from '@/hooks/useTicketComments';
import {
  useEquipmentById,
  useMaintenanceHistory,
  useEquipmentUpdateHistory,
} from '@/hooks/useEquipmentDetail';
import { formatDateTime as fmt } from '@/lib/format';
import { categoryLabel, isClosedTareaStatus, tareaStatus } from '@/lib/status/tareaStatus';
import { TicketCommentsList } from '@/components/work/TicketCommentsList';
import { AddCommentForm } from '@/components/work/AddCommentForm';
import { ConfigureEquipmentInline } from '@/components/work/ConfigureEquipmentInline';
import { TaskResolutionCard } from '@/components/work/TaskResolutionCard';

const EQUIPMENT_UPDATE = 'update_equipment';
const EQUIPMENT_INSTALLATION = 'install_equipment';
const EQUIPMENT_REPLACEMENT = 'replace_equipment';
const MAINTENANCE = 'maintain_equipment';
/** Categories the installer finalizes through the generic resolve_ticket flow. */
const GENERIC_RESOLVE_CATEGORIES: readonly string[] = [
  EQUIPMENT_INSTALLATION,
  EQUIPMENT_REPLACEMENT,
  MAINTENANCE,
];

const accessTypeLabel: Record<string, string> = {
  principal: 'Principal',
  servicio: 'Servicio',
  cochera: 'Cochera',
  puerta_2: 'Puerta 2',
  puerta_3: 'Puerta 3',
  puerta_4: 'Puerta 4',
  otro: 'Otro',
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function KeyChips({
  keyIds,
  variant,
  keyLabel,
}: {
  keyIds: string[];
  variant: 'secondary' | 'outline';
  keyLabel: (id: string) => string;
}) {
  if (keyIds.length === 0) {
    return <span className="text-muted-foreground text-xs">Ninguna</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {keyIds.map((kid) => (
        <Badge key={kid} variant={variant} className="font-mono text-xs">
          {keyLabel(kid)}
        </Badge>
      ))}
    </span>
  );
}

const CONFIGURED_EQUIPMENT_HEADING: Record<string, string> = {
  [EQUIPMENT_INSTALLATION]: 'Equipo instalado',
  [EQUIPMENT_REPLACEMENT]: 'Equipo de reemplazo',
};

/** Read-only view of the serial/model loaded through the configure flow. */
function ConfiguredEquipmentSummary({
  category,
  serial,
  model,
}: {
  category: string;
  serial: string | null;
  model: string | null;
}) {
  if (!serial) return null;
  return (
    <div className="bg-card flex flex-col gap-3 rounded-md border p-4">
      <SectionHeading
        title={CONFIGURED_EQUIPMENT_HEADING[category] ?? 'Equipo'}
        variant="secondary"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Row label="Serie" value={serial} />
        <Row label="Modelo" value={model ?? '—'} />
      </div>
    </div>
  );
}

/** Fallback back-link when the ticket cannot be loaded (status unknown, so the worklist). */
const BACK_TO_TASKS = { label: 'Volver a mis tareas', to: '/tareas' };

/**
 * TaskDetailPage — the individual view of one installer task at /tareas/:id.
 *
 * Master–detail: the Tareas list is flat and each row links here. The page
 * renders the full picture of a task, with a work section that adapts to the
 * task category (equipment update / installation / replacement / maintenance
 * / generic), the task's history (comments), and the category-appropriate
 * resolve action in the page header.
 *
 * Closed tasks (resolved / cancelled) render in read-only mode: no resolve,
 * configure or comment actions, plus a closing summary (TaskResolutionCard).
 */
export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ticketQuery = useTicket(id);
  const ticket = ticketQuery.data ?? null;
  const isClosed = ticket ? isClosedTareaStatus(ticket.status) : false;

  const resolveBatch = useResolveTickets();
  const resolveUpdate = useResolveEquipmentUpdate();
  const { data: comments = [] } = useTicketComments(ticket?.id ?? '');

  const category = ticket?.category ?? '';
  const snapshot = ticket?.equipmentUpdateSnapshot ?? null;
  const equipmentId = ticket?.equipment_id ?? null;

  // Equipment + per-category history (only wired when the task targets a device).
  const equipment = useEquipmentById(equipmentId).data ?? null;
  const maintenanceHistory =
    useMaintenanceHistory(category === MAINTENANCE ? equipmentId : null).data ?? [];
  const updatesHistory =
    useEquipmentUpdateHistory(
      category === EQUIPMENT_UPDATE ? (snapshot?.equipment_id ?? null) : null,
    ).data ?? [];

  const allKeyIds = snapshot ? [...snapshot.keys_to_activate, ...snapshot.keys_to_disable] : [];
  const rfidCodeMap = useRfidKeyCodeMap(allKeyIds);

  const { download: downloadMdb, downloadingId: downloadingPriorId } = useMdbDownload(supabase);

  const isLoading = ticketQuery.isLoading && !ticketQuery.data;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (ticketQuery.isError) {
    return <ErrorState message="Error al cargar la tarea." back={BACK_TO_TASKS} />;
  }

  if (!ticket) {
    return (
      <NotFoundState
        message="No se encontró la tarea. Puede que no tengas acceso a ella."
        back={BACK_TO_TASKS}
      />
    );
  }

  const building = ticket.building;
  const adminName = building.administration?.company_name;
  const addressParts = [building.address, building.city]
    .filter((v): v is string => Boolean(v))
    .join(', ');

  const handleResolve = () => {
    if (!snapshot) return;
    resolveUpdate.mutate({ taskId: snapshot.task_id, ticketId: ticket.id });
  };

  const handleFinalize = () => {
    resolveBatch.mutate({ ids: [ticket.id] });
  };

  function keyLabel(kid: string): string {
    return rfidCodeMap.get(kid) ?? `${kid.slice(0, 8)}…`;
  }

  const isGenericResolve = GENERIC_RESOLVE_CATEGORIES.includes(category);
  const origin = isClosed
    ? { label: 'Historial', to: '/historial' }
    : { label: 'Mis tareas', to: '/tareas' };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ticket.title}
        subtitle={categoryLabel(category)}
        breadcrumbs={[origin, { label: ticket.title }]}
        titleAdornment={<tareaStatus.Badge status={ticket.status} />}
      >
        {!isClosed && category === EQUIPMENT_UPDATE && snapshot && (
          <Button onClick={handleResolve} disabled={resolveUpdate.isPending}>
            {resolveUpdate.isPending ? 'Resolviendo...' : 'Resolver tarea'}
          </Button>
        )}
        {!isClosed && category !== EQUIPMENT_UPDATE && isGenericResolve && (
          <Button onClick={handleFinalize} disabled={resolveBatch.isPending}>
            {resolveBatch.isPending ? 'Finalizando...' : 'Finalizar tarea'}
          </Button>
        )}
      </PageHeader>

      <TaskResolutionCard ticket={ticket} />

      <div className="bg-card grid grid-cols-1 gap-4 rounded-md border p-4 md:grid-cols-2">
        <Row
          label="Edificio"
          value={
            building.name ? `${building.name}${addressParts ? ` · ${addressParts}` : ''}` : '—'
          }
        />
        <Row label="Administración" value={adminName || '—'} />
        <Row label="Creada" value={fmt(ticket.opened_at)} />
        {ticket.description && category !== EQUIPMENT_UPDATE && (
          <Row label="Descripción" value={ticket.description} />
        )}
      </div>

      {/* Work section — per category */}
      {category === EQUIPMENT_UPDATE &&
        (snapshot ? (
          <div className="bg-card flex flex-col gap-4 rounded-md border p-4">
            <SectionHeading title="Actualización" variant="secondary">
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadMdb(snapshot.mdb_storage_path, 'current')}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Descargar archivo .mdb
              </Button>
            </SectionHeading>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Row
                label={`Llaves a activar (${snapshot.keys_to_activate.length})`}
                value={
                  <KeyChips
                    keyIds={snapshot.keys_to_activate}
                    variant="secondary"
                    keyLabel={keyLabel}
                  />
                }
              />
              <Row
                label={`Llaves a dar de baja (${snapshot.keys_to_disable.length})`}
                value={
                  <KeyChips
                    keyIds={snapshot.keys_to_disable}
                    variant="outline"
                    keyLabel={keyLabel}
                  />
                }
              />
            </div>

            {/* Prior update history */}
            {updatesHistory.length > 0 && (
              <details className="rounded-md border text-sm">
                <summary className="cursor-pointer select-none px-3 py-2 font-medium">
                  Actualizaciones anteriores ({updatesHistory.length})
                </summary>
                <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
                  <p className="bg-warning/10 text-warning rounded px-3 py-2 text-xs">
                    Atención: cargar un archivo anterior desincronizará la base de datos hasta el
                    próximo update correctivo.
                  </p>
                  <div className="flex flex-col gap-1">
                    {updatesHistory.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                      >
                        <span className="text-muted-foreground text-xs">{fmt(u.created_at)}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void downloadMdb(u.mdb_storage_path, u.id)}
                          disabled={downloadingPriorId === u.id}
                          className="h-7 px-2 text-xs"
                        >
                          <Download className="mr-1 h-3 w-3" />
                          {downloadingPriorId === u.id ? 'Generando…' : 'Descargar'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}
          </div>
        ) : (
          <EmptyState
            className="bg-card rounded-md border p-4"
            message="No se encontró la tarea de actualización asociada a este ticket."
          />
        ))}

      {(category === EQUIPMENT_INSTALLATION ||
        category === EQUIPMENT_REPLACEMENT ||
        category === 'installation') && (
        <section className="flex flex-col gap-6">
          {category === EQUIPMENT_REPLACEMENT && equipment && (
            <div className="bg-card flex flex-col gap-3 rounded-md border p-4">
              <SectionHeading title="Equipo a reemplazar" variant="secondary" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Row label="Serie" value={equipment.serial_number} />
                {equipment.model && <Row label="Modelo" value={equipment.model} />}
                {equipment.access_type && (
                  <Row
                    label="Acceso"
                    value={accessTypeLabel[equipment.access_type] ?? equipment.access_type}
                  />
                )}
              </div>
            </div>
          )}
          {isClosed ? (
            <ConfiguredEquipmentSummary
              category={category}
              serial={ticket.pending_new_serial}
              model={ticket.pending_new_model ?? ticket.intended_product_name}
            />
          ) : (
            <ConfigureEquipmentInline ticket={ticket} />
          )}
        </section>
      )}

      {category === MAINTENANCE && (
        <section className="flex flex-col gap-6">
          {equipment && (
            <div className="bg-card flex flex-col gap-3 rounded-md border p-4">
              <SectionHeading title="Equipo a mantener" variant="secondary" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Row label="Serie" value={equipment.serial_number} />
                {equipment.model && <Row label="Modelo" value={equipment.model} />}
                {equipment.status !== 'active' && equipment.status && (
                  <Row label="Estado" value={equipment.status} />
                )}
                {equipment.description && <Row label="Descripción" value={equipment.description} />}
              </div>
            </div>
          )}

          {maintenanceHistory.length > 0 && (
            <details className="bg-card rounded-md border text-sm">
              <summary className="cursor-pointer select-none px-4 py-3 font-medium">
                Mantenimientos anteriores del equipo ({maintenanceHistory.length})
              </summary>
              <div className="flex flex-col gap-1.5 px-4 pb-4 pt-1">
                {maintenanceHistory.map((m) => (
                  <div key={m.id} className="flex flex-col gap-0.5 rounded border px-3 py-2">
                    <span className="text-xs font-medium">{m.title || 'Mantenimiento'}</span>
                    <span className="text-muted-foreground text-xs">
                      Resuelto el {fmt(m.resolved_at)}
                    </span>
                    {m.resolution_notes && (
                      <span className="text-muted-foreground text-xs">{m.resolution_notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Task history — comments */}
      <div className="bg-card flex flex-col gap-3 rounded-md border p-4">
        <SectionHeading title="Historial" variant="secondary" />
        <TicketCommentsList comments={comments} />
        {!isClosed && <AddCommentForm ticketId={ticket.id} />}
      </div>
    </div>
  );
}
