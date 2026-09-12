import type { TareaDetailRow } from '@/hooks/useTarea';

export type TareaTimelineTone = 'neutral' | 'success' | 'danger';

export interface TareaTimelineEntry {
  key: 'opened' | 'assigned' | 'resolved' | 'cancelled';
  label: string;
  /** ISO timestamp; null when the step has no meaningful date (assignment). */
  at: string | null;
  /** Staff name behind the step, when known. */
  actor: string | null;
  /** Resolution notes or cancellation reason. */
  detail: string | null;
  tone: TareaTimelineTone;
}

export type TareaTimelineSource = Pick<
  TareaDetailRow,
  | 'status'
  | 'opened_at'
  | 'opened_by_name'
  | 'assigned_to_name'
  | 'updated_at'
  | 'resolved_at'
  | 'resolved_by_name'
  | 'resolution_notes'
  | 'cancellation_reason'
>;

export function isTerminalTareaStatus(status: string): boolean {
  return status === 'resolved' || status === 'cancelled';
}

/**
 * Effective close time of a terminal ticket. Resolved tickets carry
 * resolved_at; cancelled tickets don't, so fall back to updated_at (set by
 * the status-change trigger). Null while the ticket is still active.
 */
export function tareaClosedAt(
  tarea: Pick<TareaDetailRow, 'status' | 'resolved_at' | 'updated_at'>,
): string | null {
  if (!isTerminalTareaStatus(tarea.status)) return null;
  return tarea.resolved_at ?? tarea.updated_at;
}

function nonEmpty(value: string | null): string | null {
  return value && value.trim().length > 0 ? value : null;
}

/**
 * Builds the vertical timeline shown in the "Trazabilidad" card:
 * Abierta → Asignada a (optional) → Finalizada / Cancelada (terminal only).
 */
export function buildTareaTimeline(tarea: TareaTimelineSource): TareaTimelineEntry[] {
  const entries: TareaTimelineEntry[] = [
    {
      key: 'opened',
      label: 'Abierta',
      at: tarea.opened_at,
      actor: tarea.opened_by_name,
      detail: null,
      tone: 'neutral',
    },
  ];

  if (tarea.assigned_to_name) {
    entries.push({
      key: 'assigned',
      label: 'Asignada a',
      at: null,
      actor: tarea.assigned_to_name,
      detail: null,
      tone: 'neutral',
    });
  }

  if (tarea.status === 'resolved') {
    entries.push({
      key: 'resolved',
      label: 'Finalizada',
      at: tareaClosedAt(tarea),
      actor: tarea.resolved_by_name,
      detail: nonEmpty(tarea.resolution_notes),
      tone: 'success',
    });
  } else if (tarea.status === 'cancelled') {
    entries.push({
      key: 'cancelled',
      label: 'Cancelada',
      at: tareaClosedAt(tarea),
      actor: tarea.resolved_by_name,
      detail: nonEmpty(tarea.cancellation_reason),
      tone: 'danger',
    });
  }

  return entries;
}
