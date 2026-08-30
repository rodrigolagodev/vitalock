import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  EmptyState,
  ErrorState,
  NotFoundState,
  SectionHeading,
  Skeleton,
} from '@vitalock/ui';
import { useTarea } from '@/hooks/useTarea';
import { TareaStatusBadge } from '@/components/tareas/TareaStatusBadge';
import { TareaFormSheet } from '@/components/tareas/TareaFormSheet';
import { AssignEquipmentDialog } from '@/components/tareas/AssignEquipmentDialog';
import { ConfigureEquipmentPanel } from '@/components/tareas/ConfigureEquipmentPanel';
import type { TareaRow } from '@/hooks/useTareas';

// Categories that use the two-step configure + finalize flow. AssignEquipmentDialog
// is bypassed for these; ConfigureEquipmentPanel captures the serial and
// resolve_ticket handles the finalize.
const CATEGORIES_TWO_STEP_CONFIGURE = new Set<TareaRow['category']>([
  'equipment_installation',
  'equipment_replacement',
]);

const CATEGORY_LABELS: Record<TareaRow['category'] | 'key_installation', string> = {
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
  key_configuration: 'Configuración de llave',
  key_installation: 'Instalación de llave', // Retained for display of cancelled historical tickets.
  equipment_installation: 'Instalación de equipo',
  equipment_replacement: 'Cambio de equipo',
};

const CATEGORIES_REQUIRING_EQUIPMENT = new Set<TareaRow['category']>([
  'maintenance',
  'installation',
  'equipment_installation',
  'equipment_replacement',
]);

const ACCESS_TYPE_LABELS: Record<string, string> = {
  principal: 'Principal',
  servicio: 'Servicio',
  cochera: 'Cochera',
  puerta_2: 'Puerta 2',
  puerta_3: 'Puerta 3',
  puerta_4: 'Puerta 4',
  otro: 'Otro',
};

const ASSIGN_BUTTON_LABEL: Record<TareaRow['category'] | 'key_installation', string> = {
  maintenance: 'Asignar equipo existente',
  installation: 'Registrar equipo instalado',
  key_configuration: '—',
  key_installation: '—', // Retained for display of cancelled historical tickets.
  equipment_installation: 'Registrar equipo instalado',
  equipment_replacement: 'Reemplazar equipo',
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
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function TareaDetailPage() {
  const { tareaId } = useParams<{ tareaId: string }>();
  const { data: tarea, isLoading, isError } = useTarea(tareaId);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  if (!tareaId) {
    return (
      <ErrorState
        message="ID de tarea inválido."
        back={{ label: 'Volver a tareas', to: '/tareas' }}
        className="py-24"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || tarea == null) {
    return isError ? (
      <ErrorState
        message="Error al cargar la tarea."
        back={{ label: 'Volver a tareas', to: '/tareas' }}
        className="py-24"
      />
    ) : (
      <NotFoundState
        message="Tarea no encontrada."
        back={{ label: 'Volver a tareas', to: '/tareas' }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/tareas" className="hover:text-foreground transition-colors">
          Tareas
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{tarea.ticket_number}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{tarea.ticket_number}</h1>
            <TareaStatusBadge status={tarea.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[tarea.category] ?? tarea.category}
          </p>
        </div>

        <Button onClick={() => setEditOpen(true)}>Editar</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-md border bg-card p-4 md:grid-cols-2">
        <Row label="Descripción" value={tarea.description || '—'} />
        <Row
          label="Edificio"
          value={
            tarea.building
              ? tarea.building.administration
                ? `${tarea.building.name} — ${tarea.building.administration.company_name}`
                : tarea.building.name
              : '—'
          }
        />
        <Row label="Asignado a" value={tarea.assigned_to_name ?? 'Sin asignar'} />
        <Row label="Abierta por" value={tarea.opened_by_name ?? '—'} />
        <Row label="Abierta" value={fmt(tarea.opened_at)} />
        <Row label="Actualizada" value={fmt(tarea.updated_at)} />
        {tarea.resolution_notes && (
          <Row label="Notas de resolución" value={tarea.resolution_notes} />
        )}
        {tarea.cancellation_reason && (
          <Row label="Motivo de cancelación" value={tarea.cancellation_reason} />
        )}
        {tarea.notes && <Row label="Notas" value={tarea.notes} />}
      </div>

      {CATEGORIES_REQUIRING_EQUIPMENT.has(tarea.category) && (
        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <SectionHeading
            title={
              tarea.category === 'equipment_replacement' ? 'Equipo actual' : 'Equipo'
            }
            variant="secondary"
          >
            {tarea.building_id &&
              tarea.status !== 'resolved' &&
              tarea.status !== 'cancelled' &&
              !CATEGORIES_TWO_STEP_CONFIGURE.has(tarea.category) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignOpen(true)}
                >
                  {tarea.equipment
                    ? 'Cambiar asignación'
                    : ASSIGN_BUTTON_LABEL[tarea.category]}
                </Button>
              )}
          </SectionHeading>

          {tarea.equipment ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Row label="Serie" value={tarea.equipment.serial_number} />
              <Row label="Modelo" value={tarea.equipment.model ?? '—'} />
              <Row
                label="Tipo de acceso"
                value={
                  ACCESS_TYPE_LABELS[tarea.equipment.access_type] ??
                  tarea.equipment.access_type
                }
              />
              <Row label="Estado" value={tarea.equipment.status} />
            </div>
          ) : (
            <EmptyState
              message={
                tarea.category === 'equipment_installation'
                  ? 'Todavía no hay equipo instalado. Cargá abajo el serie del equipo que se va a instalar.'
                  : 'Sin equipo asignado. Se requiere asignar uno para poder resolver la tarea.'
              }
            />
          )}
        </div>
      )}

      {CATEGORIES_TWO_STEP_CONFIGURE.has(tarea.category) &&
        tarea.status !== 'resolved' &&
        tarea.status !== 'cancelled' && (
          <ConfigureEquipmentPanel tarea={tarea} />
        )}

      <TareaFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        tarea={tarea}
      />

      {tarea.building_id && !CATEGORIES_TWO_STEP_CONFIGURE.has(tarea.category) && (
        <AssignEquipmentDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          ticketId={tarea.id}
          buildingId={tarea.building_id}
          category={tarea.category}
        />
      )}
    </div>
  );
}
