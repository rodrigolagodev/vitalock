import { StatusBadge } from '@vitalock/ui';
import type { KeyOrderStatus } from '@/hooks/useKeyOrders';
import { keyOrderStatusLabel, keyOrderStatusTone } from '@/lib/status/keyOrderStatus';

interface KeyOrderStatusBadgeProps {
  status: KeyOrderStatus;
}

export function KeyOrderStatusBadge({ status }: KeyOrderStatusBadgeProps) {
  return (
    <StatusBadge tone={keyOrderStatusTone(status)}>
      {keyOrderStatusLabel(status)}
    </StatusBadge>
  );
}
