import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Badge, Button } from '@vitalock/ui';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import { useResolveEquipmentUpdate } from '@/hooks/useResolveEquipmentUpdate';
import { useResolveTickets } from '@/hooks/useResolveTickets';
import { useRfidKeyCodeMap } from '@/hooks/useRfidKeyCodeMap';
import { useTicketComments } from '@/hooks/useTicketComments';
import { useEquipmentById, useMaintenanceHistory, useEquipmentUpdateHistory } from '@/hooks/useEquipmentDetail';
import { TicketCommentsList } from '@/components/work/TicketCommentsList';
import { AddCommentForm } from '@/components/work/AddCommentForm';
import { ConfigureEquipmentInline } from '@/components/work/ConfigureEquipmentInline';

const statusLabel: Record<string, string> = {
  open: 'Pendiente',
  in_progress: 'En curso',
};

const statusVariant: Record<string, 'default' | 'secondary'> = {
  open: 'default',
  in_progress: 'secondary',
};

const categorySubtitle: Record<string, string> = {
  equipment_update: 'Actualización de equipo',
  equipment_installation: 'Instalación de equipo',
  equipment_replacement: 'Reemplazo de equipo',
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
};

const EQUIPMENT_UPDATE = 'equipment_update';
const EQUIPMENT_INSTALLATION = 'equipment_installation';
const EQUIPMENT_REPLACEMENT = 'equipment_replacement';
const MAINTENANCE = 'maintenance';
/** Categories the installer finalizes through the generic resolve_ticket flow. */
const GENERIC_RESOLVE_CATEGORIES: readonly string[] = [
  EQUIPMENT_INSTALLATION,
  EQUIPMENT_REPLACEMENT,
  MAINTENANCE,
  'installation',
];

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

const accessTypeLabel: Record<string, string> = {
  principal: 'Principal',
  servicio: 'Servicio',
  cochera: 'Cochera',
  puerta_2: 'Puerta 2',
  puerta_3: 'Puerta 3',
  puerta_4: 'Puerta 4',
  otro: 'Otro',
};

/**
 * TaskDetailPage — the individual view of one installer task at /tareas/:id.
 *
 * Master–detail: the Tareas list is flat and each row links here. The page
 * renders the full picture of a task, with a work section that adapts to the
 * task category (equipment update / installation / replacement / maintenance
 * / generic), the task's history (comments), and the category-appropriate
 * resolve action.
 */
export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const assigned = useAssignedTickets();
  const ticket = assigned.data?.find((t) => t.id === id);

  const resolveBatch = useResolveTickets();
  const resolveUpdate = useResolveEquipmentUpdate();
  const { data: comments = [] } = useTicketComments(ticket?.id ?? '');

  const category = ticket?.category ?? '';
  const snapshot = ticket?.equipmentUpdateSnapshot ?? null;
  const equipmentId = ticket?.equipment_id ?? null;

  // Equipment + per-category history (only wired when the task targets a device).
  const equipment = useEquipmentById(equipmentId).data ?? null;
  const maintenanceHistory = useMaintenanceHistory(
    category === MAINTENANCE ? equipmentId : null,
  ).data ?? [];
  const updatesHistory = useEquipmentUpdateHistory(
    category === EQUIPMENT_UPDATE ? snapshot?.equipment_id ?? null : null,
  ).data ?? [];

  const allKeyIds = snapshot
    ? [...snapshot.keys_to_activate, ...snapshot.keys_to_disable]
    : [];
  const rfidCodeMap = useRfidKeyCodeMap(allKeyIds);

  const [downloadingPriorId, setDownloadingPriorId] = useState<string | null>(null);

  const isLoading = assigned.isLoading && !assigned.data;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
        <Link
          to="/tareas"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Mis tareas
        </Link>
        <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
          No se encontró la tarea. Puede que ya esté cerrada o que no tengas acceso a ella.
        </p>
      </div>
    );
  }

  const building = ticket.building;
  const adminName = building.administration?.company_name;
  const addressParts = [building.address, building.city]
    .filter((v): v is string => Boolean(v))
    .join(', ');

  const handleDownload = async () => {
    if (!snapshot) return;
    const { data, error } = await supabase.storage
      .from('equipment-updates-mdb')
      .createSignedUrl(snapshot.mdb_storage_path, 300);
    if (error || !data?.signedUrl) return;
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = snapshot.mdb_storage_path.split('/').pop() ?? 'db.mdb';
    a.click();
  };

  const handleDownloadPrior = async (path: string, id: string) => {
    setDownloadingPriorId(id);
    try {
      const { data, error } = await supabase.storage
        .from('equipment-updates-mdb')
        .createSignedUrl(path, 300);
      if (error || !data?.signedUrl) return;
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = path.split('/').pop() ?? 'db.mdb';
      a.click();
    } finally {
      setDownloadingPriorId(null);
    }
  };

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

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
      <Link
        to="/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Mis tareas
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold">{ticket.title}</h1>
          <Badge variant={statusVariant[ticket.status]} className="shrink-0">
            {statusLabel[ticket.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {categorySubtitle[category] ?? 'Tarea'}
        </p>
        {building?.name && (
          <p className="text-sm text-muted-foreground">
            {building.name}
            {addressParts ? ` · ${addressParts}` : ''}
          </p>
        )}
        {adminName && <p className="text-sm text-muted-foreground">{adminName}</p>}
        <p className="text-xs text-muted-foreground">Creada el {fmt(ticket.opened_at)}</p>
      </header>

      {ticket.description && category !== EQUIPMENT_UPDATE && (
        <p className="text-sm text-muted-foreground">{ticket.description}</p>
      )}

      {/* Work section — per category */}
      {category === EQUIPMENT_UPDATE && (
        <>
          {snapshot ? (
            <section className="rounded-md border bg-card p-4 flex flex-col gap-4">
              {/* Keys to activate */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Llaves a activar ({snapshot.keys_to_activate.length})
                </p>
                {snapshot.keys_to_activate.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ninguna</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {snapshot.keys_to_activate.map((kid) => (
                      <Badge key={kid} variant="secondary" className="font-mono text-xs">
                        {keyLabel(kid)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Keys to disable */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Llaves a dar de baja ({snapshot.keys_to_disable.length})
                </p>
                {snapshot.keys_to_disable.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ninguna</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {snapshot.keys_to_disable.map((kid) => (
                      <Badge key={kid} variant="outline" className="font-mono text-xs">
                        {keyLabel(kid)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDownload()}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Descargar archivo .mdb
                </Button>
              </div>

              {/* Prior update history */}
              {updatesHistory.length > 0 && (
                <details className="rounded-md border border-border text-sm">
                  <summary className="cursor-pointer select-none px-3 py-2 font-medium">
                    Actualizaciones anteriores ({updatesHistory.length})
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
                    <p className="rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
                      Atención: cargar un archivo anterior desincronizará la base de datos hasta el próximo update correctivo.
                    </p>
                    <div className="flex flex-col gap-1">
                      {updatesHistory.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
                        >
                          <span className="text-xs text-muted-foreground">{fmt(u.created_at)}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDownloadPrior(u.mdb_storage_path, u.id)}
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
            </section>
          ) : (
            <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
              No se encontró la tarea de actualización asociada a este ticket.
            </p>
          )}
        </>
      )}

      {(category === EQUIPMENT_INSTALLATION || category === EQUIPMENT_REPLACEMENT) && (
        <section className="flex flex-col gap-4">
          {category === EQUIPMENT_REPLACEMENT && equipment && (
            <div className="rounded-md border bg-card p-4 flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Equipo a reemplazar
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Serie:</span> {equipment.serial_number}
              </p>
              {equipment.model && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Modelo:</span> {equipment.model}
                </p>
              )}
              {equipment.access_type && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Acceso:</span>{' '}
                  {accessTypeLabel[equipment.access_type] ?? equipment.access_type}
                </p>
              )}
            </div>
          )}
          <ConfigureEquipmentInline ticket={ticket} />
        </section>
      )}

      {category === MAINTENANCE && (
        <section className="flex flex-col gap-4">
          {equipment && (
            <div className="rounded-md border bg-card p-4 flex flex-col gap-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Equipo a mantener
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Serie:</span> {equipment.serial_number}
              </p>
              {equipment.model && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Modelo:</span> {equipment.model}
                </p>
              )}
              {equipment.status !== 'active' && equipment.status && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Estado:</span> {equipment.status}
                </p>
              )}
              {equipment.description && (
                <p className="text-sm text-muted-foreground">{equipment.description}</p>
              )}
            </div>
          )}

          {maintenanceHistory.length > 0 && (
            <details className="rounded-md border border-border text-sm">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium">
                Mantenimientos anteriores del equipo ({maintenanceHistory.length})
              </summary>
              <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
                {maintenanceHistory.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col gap-0.5 rounded border border-border px-2 py-1.5"
                  >
                    <span className="text-xs font-medium">{m.title || 'Mantenimiento'}</span>
                    <span className="text-xs text-muted-foreground">
                      Resuelto el {fmt(m.resolved_at)}
                    </span>
                    {m.resolution_notes && (
                      <span className="text-xs text-muted-foreground">{m.resolution_notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Task history — comments */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Historial
        </h2>
        <TicketCommentsList comments={comments} />
        <AddCommentForm ticketId={ticket.id} />
      </section>

      <Separator />

      {/* Resolve action — per category */}
      {category === EQUIPMENT_UPDATE && snapshot && (
        <Button
          size="sm"
          className="w-full"
          onClick={handleResolve}
          disabled={resolveUpdate.isPending}
        >
          {resolveUpdate.isPending ? 'Resolviendo...' : 'Resolver tarea'}
        </Button>
      )}

      {category !== EQUIPMENT_UPDATE && isGenericResolve && (
        <Button
          size="sm"
          className="w-full"
          onClick={handleFinalize}
          disabled={resolveBatch.isPending}
        >
          {resolveBatch.isPending ? 'Finalizando...' : 'Finalizar tarea'}
        </Button>
      )}
    </div>
  );
}
