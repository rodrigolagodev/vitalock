import type { StatusTone } from '@vitalock/ui';

/** Work-order / task status. Labels are FEMININE because they qualify "la tarea". */
export type TareaStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

const TAREA_STATUS_META: Record<TareaStatus, { label: string; tone: StatusTone }> = {
  open: { label: 'Pendiente', tone: 'neutral' },
  in_progress: { label: 'En curso', tone: 'warning' },
  resolved: { label: 'Finalizada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export function tareaStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return TAREA_STATUS_META[status as TareaStatus]?.label ?? status;
}

export function tareaStatusTone(status: string | null | undefined): StatusTone {
  return TAREA_STATUS_META[status as TareaStatus]?.tone ?? 'neutral';
}
