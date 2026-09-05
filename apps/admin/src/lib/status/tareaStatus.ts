import { createStatusHelpers } from '@vitalock/ui';

/** Work-order / task status. Labels are FEMININE because they qualify "la tarea". */
export type TareaStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export const tareaStatus = createStatusHelpers<TareaStatus>({
  open: { label: 'Pendiente', tone: 'neutral' },
  in_progress: { label: 'En curso', tone: 'warning' },
  resolved: { label: 'Finalizada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
});
