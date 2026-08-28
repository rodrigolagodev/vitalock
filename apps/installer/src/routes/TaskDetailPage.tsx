import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Badge, Button } from '@vitalock/ui';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import { useResolveEquipmentUpdate } from '@/hooks/useResolveEquipmentUpdate';
import { useRfidKeyCodeMap } from '@/hooks/useRfidKeyCodeMap';
import { useTicketComments } from '@/hooks/useTicketComments';
import { TicketCommentsList } from '@/components/work/TicketCommentsList';
import { AddCommentForm } from '@/components/work/AddCommentForm';

const statusLabel: Record<string, string> = {
  open: 'Pendiente',
  in_progress: 'En curso',
};

const statusVariant: Record<string, 'default' | 'secondary'> = {
  open: 'default',
  in_progress: 'secondary',
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

interface PriorUpdate {
  id: string;
  created_at: string;
  mdb_storage_path: string;
}

/**
 * TaskDetailPage — the individual view of one installer task at /tareas/:id.
 *
 * Master–detail: the Tareas list is flat and each row links here. The page
 * shows the full work order in one screen: what to do (keys to activate /
 * disable + the .mdb download), the task's own history (comments), prior
 * updates for rollback, and the primary Resolve action.
 */
export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const assigned = useAssignedTickets();
  const ticket = assigned.data?.find((t) => t.id === id);

  const snapshot = ticket?.equipmentUpdateSnapshot ?? null;
  const resolve = useResolveEquipmentUpdate();
  const { data: comments = [] } = useTicketComments(ticket?.id ?? '');

  const allKeyIds = snapshot
    ? [...snapshot.keys_to_activate, ...snapshot.keys_to_disable]
    : [];
  const rfidCodeMap = useRfidKeyCodeMap(allKeyIds);

  // Prior resolved updates for this equipment (rollback section).
  const [priorUpdates, setPriorUpdates] = useState<PriorUpdate[]>([]);
  const [downloadingPriorId, setDownloadingPriorId] = useState<string | null>(null);

  useEffect(() => {
    const equipmentId = snapshot?.equipment_id;
    if (!equipmentId) {
      setPriorUpdates([]);
      return;
    }

    let cancelled = false;
    void supabase
      .schema('support')
      .from('equipment_updates')
      .select('id, created_at, mdb_storage_path')
      .eq('equipment_id', equipmentId)
      .not('resolved_at', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setPriorUpdates((data ?? []) as unknown as PriorUpdate[]);
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot?.equipment_id]);

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
  const administrationName = building.administration?.company_name;

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

  const handleDownloadPrior = async (update: PriorUpdate) => {
    setDownloadingPriorId(update.id);
    try {
      const { data, error } = await supabase.storage
        .from('equipment-updates-mdb')
        .createSignedUrl(update.mdb_storage_path, 300);
      if (error || !data?.signedUrl) return;
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = update.mdb_storage_path.split('/').pop() ?? 'db.mdb';
      a.click();
    } finally {
      setDownloadingPriorId(null);
    }
  };

  const handleResolve = () => {
    if (!snapshot) return;
    resolve.mutate({ taskId: snapshot.task_id, ticketId: ticket.id });
  };

  function keyLabel(kid: string): string {
    return rfidCodeMap.get(kid) ?? `${kid.slice(0, 8)}…`;
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
      <Link
        to="/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Mis tareas
      </Link>

      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold">{ticket.title}</h1>
          <Badge variant={statusVariant[ticket.status]} className="shrink-0">
            {statusLabel[ticket.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">Actualización de equipo</p>
        {(building?.name || administrationName) && (
          <p className="text-sm text-muted-foreground">
            {building?.name}
            {administrationName ? ` · ${administrationName}` : ''}
          </p>
        )}
      </header>

      {!!snapshot && (
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
        </section>
      )}

      {!snapshot && (
        <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
          No se encontró la tarea de actualización asociada a este ticket.
        </p>
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

      {/* Prior updates collapsible — rollback */}
      {snapshot?.equipment_id && priorUpdates.length > 0 && (
        <details className="rounded-md border border-border text-sm">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium">
            Actualizaciones anteriores ({priorUpdates.length})
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
            <p className="rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
              Atención: cargar un archivo anterior desincronizará la base de datos hasta el próximo update correctivo.
            </p>
            <div className="flex flex-col gap-1">
              {priorUpdates.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
                >
                  <span className="text-xs text-muted-foreground">{fmt(u.created_at)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDownloadPrior(u)}
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

      <Button
        size="sm"
        className="w-full"
        onClick={handleResolve}
        disabled={!snapshot || resolve.isPending}
      >
        {resolve.isPending ? 'Resolviendo...' : 'Resolver tarea'}
      </Button>
    </div>
  );
}
