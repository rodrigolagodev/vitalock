import { Badge } from '@/components/ui/badge';
import type { TareaRow } from '@/hooks/useTareas';

type TareaStatus = TareaRow['status'];

const STATUS_LABELS: Record<TareaStatus, string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  resolved: 'Resuelta',
  cancelled: 'Cancelada',
};

const STATUS_VARIANTS: Record<
  TareaStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  open: 'default',
  in_progress: 'secondary',
  resolved: 'outline',
  cancelled: 'destructive',
};

interface TareaStatusBadgeProps {
  status: TareaStatus;
}

export function TareaStatusBadge({ status }: TareaStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
