import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Button } from '@vitalock/ui';
import { useEquipmentUpdates } from '@/hooks/useEquipmentUpdates';
import { PendingKeysGuardrailBadge } from './PendingKeysGuardrailBadge';
import { EquipmentUpdateFormSheet } from './EquipmentUpdateFormSheet';
import { EquipmentUpdateTaskDetail } from './EquipmentUpdateTaskDetail';
import type { EquipmentRow } from '@/hooks/useEquipment';
import type { KeyRow } from '@/hooks/useKeys';

interface EquipmentUpdatePanelProps {
  equipment: EquipmentRow;
  administrationId: string;
  allKeys: KeyRow[];
}

/**
 * Per-equipment panel rendered in the building equipment tab.
 * Shows the guardrail badge (pending keys not in any active train),
 * the most recent open/in_progress equipment_update task if any,
 * and a creation button when no active train exists.
 */
export function EquipmentUpdatePanel({
  equipment,
  administrationId,
  allKeys,
}: EquipmentUpdatePanelProps) {
  const { data: updates = [] } = useEquipmentUpdates(equipment.id);
  const [formOpen, setFormOpen] = useState(false);

  const pendingActivate = allKeys.filter(
    (k) => k.status === 'pending_installation',
  );
  const pendingDisable = allKeys.filter(
    (k) => k.status === 'pending_disable',
  );

  const activeTrain = updates.find(
    (u) => u.ticket_status === 'open' || u.ticket_status === 'in_progress',
  );

  const hasPendingKeys = pendingActivate.length > 0 || pendingDisable.length > 0;
  const canCreate = !activeTrain && hasPendingKeys;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {equipment.model ?? equipment.serial_number}
          </span>
          <PendingKeysGuardrailBadge
            keys={allKeys}
            equipmentUpdates={updates}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!canCreate}
          onClick={() => setFormOpen(true)}
          title={
            activeTrain
              ? 'Ya existe una tarea de actualización en curso'
              : !hasPendingKeys
                ? 'No hay llaves pendientes para este equipo'
                : 'Crear tarea de actualización'
          }
        >
          <PlusCircle className="mr-1.5 h-4 w-4" />
          Crear tarea de actualización
        </Button>
      </div>

      {activeTrain && (
        <EquipmentUpdateTaskDetail
          update={activeTrain}
          keysToActivate={allKeys.filter((k) => activeTrain.keys_to_activate.includes(k.id))}
          keysToDisable={allKeys.filter((k) => activeTrain.keys_to_disable.includes(k.id))}
        />
      )}

      {formOpen && activeTrain && (
        <EquipmentUpdateFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          equipmentId={equipment.id}
          administrationId={administrationId}
          buildingId={equipment.building_id}
          pendingActivate={pendingActivate}
          pendingDisable={pendingDisable}
          ticketId={activeTrain.ticket_id}
        />
      )}

      {formOpen && !activeTrain && (
        <EquipmentUpdateFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          equipmentId={equipment.id}
          administrationId={administrationId}
          buildingId={equipment.building_id}
          pendingActivate={pendingActivate}
          pendingDisable={pendingDisable}
          ticketId={`pending-${equipment.id}`}
        />
      )}
    </div>
  );
}
