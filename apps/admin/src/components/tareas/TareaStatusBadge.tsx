import { StatusBadge } from '@vitalock/ui';
import {
  tareaStatusLabel,
  tareaStatusTone,
  type TareaStatus,
} from '@/lib/status/tareaStatus';

interface TareaStatusBadgeProps {
  status: TareaStatus;
}

export function TareaStatusBadge({ status }: TareaStatusBadgeProps) {
  return (
    <StatusBadge tone={tareaStatusTone(status)}>
      {tareaStatusLabel(status)}
    </StatusBadge>
  );
}
