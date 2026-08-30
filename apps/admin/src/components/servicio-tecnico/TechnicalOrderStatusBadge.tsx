import { StatusBadge } from '@vitalock/ui';
import {
  technicalOrderStatusLabel,
  technicalOrderStatusTone,
  type TechnicalOrderStatus,
} from '@/lib/status/technicalOrderStatus';

interface TechnicalOrderStatusBadgeProps {
  status: TechnicalOrderStatus;
}

export function TechnicalOrderStatusBadge({ status }: TechnicalOrderStatusBadgeProps) {
  return (
    <StatusBadge tone={technicalOrderStatusTone(status)}>
      {technicalOrderStatusLabel(status)}
    </StatusBadge>
  );
}
