import { useMemo } from 'react';
import { Badge } from '@vitalock/ui';
import type { KeyRow } from '@/hooks/useKeys';
import type { EquipmentUpdateRow } from '@/hooks/useEquipmentUpdates';

interface PendingKeysGuardrailBadgeProps {
  keys: KeyRow[];
  equipmentUpdates: EquipmentUpdateRow[];
}

/**
 * Shows how many pending keys (pending_installation or pending_disable) for
 * this equipment are NOT covered by any open or in_progress equipment_update
 * snapshot. When all pending keys are accounted for in an active train, the
 * badge is hidden. Badge is also hidden when there are no pending keys at all.
 */
export function PendingKeysGuardrailBadge({
  keys,
  equipmentUpdates,
}: PendingKeysGuardrailBadgeProps) {
  const uncoveredCount = useMemo(() => {
    const pendingKeys = keys.filter(
      (k) => k.status === 'pending_installation' || k.status === 'pending_disable',
    );

    if (pendingKeys.length === 0) return 0;

    const activeTrains = equipmentUpdates.filter(
      (u) => u.ticket_status === 'open' || u.ticket_status === 'in_progress',
    );

    const coveredIds = new Set<string>();
    for (const train of activeTrains) {
      for (const id of train.keys_to_activate) coveredIds.add(id);
      for (const id of train.keys_to_disable) coveredIds.add(id);
    }

    return pendingKeys.filter((k) => !coveredIds.has(k.id)).length;
  }, [keys, equipmentUpdates]);

  if (uncoveredCount === 0) return null;

  return (
    <Badge variant="destructive" className="shrink-0">
      {uncoveredCount}
    </Badge>
  );
}
