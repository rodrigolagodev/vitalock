import { createStatusHelpers } from '@vitalock/ui';

/**
 * Installer task (ticket) status. Labels are FEMININE because they qualify
 * "la tarea". Single source for label + tone across Dashboard, Tareas,
 * Historial and the task detail so they can never diverge.
 */
export type TareaStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export const tareaStatus = createStatusHelpers<TareaStatus>({
  open: { label: 'Pendiente', tone: 'neutral' },
  in_progress: { label: 'En curso', tone: 'warning' },
  resolved: { label: 'Resuelta', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
});

/** True once a ticket reached a terminal state: no more installer actions. */
export function isClosedTareaStatus(status: TareaStatus): boolean {
  return status === 'resolved' || status === 'cancelled';
}

/**
 * Effective close time of a terminal ticket. Resolved tickets carry
 * resolved_at; cancelled ones don't, so fall back to updated_at (set by the
 * status-change trigger).
 */
export function ticketClosedAt(ticket: { resolved_at: string | null; updated_at: string }): string {
  return ticket.resolved_at ?? ticket.updated_at;
}

/** Sort weight: in-progress work first, then untouched tasks. */
const ACTIVE_STATUS_ORDER: Record<'in_progress' | 'open', number> = {
  in_progress: 0,
  open: 1,
};

/** Active tickets ordered in-progress first, then oldest opened first. */
export function sortActiveTickets<T extends { status: 'open' | 'in_progress'; opened_at: string }>(
  tickets: readonly T[],
): T[] {
  return [...tickets].sort((a, b) => {
    const statusDiff = ACTIVE_STATUS_ORDER[a.status] - ACTIVE_STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.opened_at.localeCompare(b.opened_at);
  });
}

/** Human label for a ticket category; unknown categories fall back to "Tarea". */
export const CATEGORY_LABELS: Record<string, string> = {
  update_equipment: 'Actualización de equipo',
  install_equipment: 'Instalación de equipo',
  replace_equipment: 'Reemplazo de equipo',
  maintain_equipment: 'Mantenimiento',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Tarea';
}
