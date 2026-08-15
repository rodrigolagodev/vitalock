import { StatusBadge, type StatusTone } from '@vitalock/ui';
import type { TareaRow } from '@/hooks/useTareas';

type TareaStatus = TareaRow['status'];

const STATUS_LABELS: Record<TareaStatus, string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  resolved: 'Resuelta',
  cancelled: 'Cancelada',
};

const STATUS_TONES: Record<TareaStatus, StatusTone> = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
  cancelled: 'danger',
};

interface TareaStatusBadgeProps {
  status: TareaStatus;
}

export function TareaStatusBadge({ status }: TareaStatusBadgeProps) {
  return (
    <StatusBadge tone={STATUS_TONES[status]}>
      {STATUS_LABELS[status]}
    </StatusBadge>
  );
}
