import { useMemo, useState } from 'react';
import { Copy, Check, PlusCircle } from 'lucide-react';
import { Button, EmptyState, ErrorState } from '@vitalock/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@vitalock/ui';
import { usePendingKeysForEquipment } from '@/hooks/usePendingKeysForEquipment';
import { useEquipmentUpdates } from '@/hooks/useEquipmentUpdates';
import { useKeys } from '@/hooks/useKeys';
import { EquipmentUpdateFormSheet } from './EquipmentUpdateFormSheet';
import type { PendingKey } from '@/hooks/usePendingKeysForEquipment';

interface EquipmentKeySnapshotPanelProps {
  equipmentId: string;
  /** Required to enable the "Nueva actualización" button (creates an equipment_update ticket). */
  buildingId?: string;
  /** Required to enable the "Nueva actualización" button. */
  administrationId?: string;
}

function formatSnapshotForClipboard(
  toActivate: PendingKey[],
  toDisable: PendingKey[],
  unchanged: PendingKey[],
): string {
  const section = (title: string, keys: PendingKey[]) => {
    if (keys.length === 0) return `${title}\n  (ninguna)`;
    const rows = keys
      .map((k) => `  - ${k.rfid_code}${k.unit_number ? ` (unidad ${k.unit_number})` : ''}`)
      .join('\n');
    return `${title}\n${rows}`;
  };
  return [
    section('A activar', toActivate),
    section('A dar de baja', toDisable),
    section('Sin cambios', unchanged),
  ].join('\n\n');
}

function KeyTable({ keys, emptyMessage }: { keys: PendingKey[]; emptyMessage: string }) {
  if (keys.length === 0) {
    return <EmptyState message={emptyMessage} className="py-4 text-center" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">RFID</th>
            <th className="pb-2 font-medium">Unidad</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b last:border-b-0">
              <td className="py-2 pr-4">
                <span className="font-mono text-sm">{k.rfid_code}</span>
              </td>
              <td className="py-2 text-muted-foreground">{k.unit_number ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Shows the 3-group key snapshot for a single equipment:
 * "A activar" / "A dar de baja" / "Sin cambios"
 *
 * When `buildingId` and `administrationId` are provided, also renders a
 * "Nueva actualización" button that opens the create-ticket sheet, disabled
 * while there is already an open/in_progress equipment_update for this equipment.
 */
export function EquipmentKeySnapshotPanel({
  equipmentId,
  buildingId,
  administrationId,
}: EquipmentKeySnapshotPanelProps) {
  const { data, isLoading, isError } = usePendingKeysForEquipment(equipmentId);
  const { data: updates = [] } = useEquipmentUpdates(equipmentId);
  const { data: buildingKeys = [] } = useKeys(buildingId);
  const [copied, setCopied] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const toActivate = data?.toActivate ?? [];
  const toDisable = data?.toDisable ?? [];
  const unchanged = data?.unchanged ?? [];

  const activeTrain = updates.find(
    (u) => u.ticket_status === 'open' || u.ticket_status === 'in_progress',
  );

  // Filter the building-scoped keys down to just the ones in the snapshot,
  // so the create sheet receives fully-shaped KeyRow objects (with unit).
  const activateIdSet = useMemo(
    () => new Set(toActivate.map((k) => k.id)),
    [toActivate],
  );
  const disableIdSet = useMemo(
    () => new Set(toDisable.map((k) => k.id)),
    [toDisable],
  );
  const pendingActivateRows = useMemo(
    () => buildingKeys.filter((k) => activateIdSet.has(k.id)),
    [buildingKeys, activateIdSet],
  );
  const pendingDisableRows = useMemo(
    () => buildingKeys.filter((k) => disableIdSet.has(k.id)),
    [buildingKeys, disableIdSet],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message="No se pudo cargar el estado de llaves pendientes."
        className="py-4"
      />
    );
  }

  const handleCopy = async () => {
    const text = formatSnapshotForClipboard(toActivate, toDisable, unchanged);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canCreate =
    Boolean(buildingId) &&
    Boolean(administrationId) &&
    !activeTrain &&
    (toActivate.length > 0 || toDisable.length > 0);

  const createDisabledReason = activeTrain
    ? 'Ya hay una tarea de actualización en curso'
    : toActivate.length === 0 && toDisable.length === 0
      ? 'No hay llaves pendientes para este equipo'
      : !buildingId || !administrationId
        ? 'Falta contexto del edificio'
        : undefined;

  return (
    <>
      <Tabs defaultValue="activate">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="activate">
              A activar
              {toActivate.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  {toActivate.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="disable">
              A dar de baja
              {toDisable.length > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                  {toDisable.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="unchanged">
              Sin cambios
              {unchanged.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {unchanged.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar snapshot'}
            </Button>
            {(buildingId && administrationId) && (
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={!canCreate}
                title={createDisabledReason ?? 'Crear tarea de actualización'}
                className="shrink-0"
              >
                <PlusCircle className="mr-1 h-4 w-4" />
                Nueva actualización
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="activate">
          <KeyTable keys={toActivate} emptyMessage="No hay llaves pendientes de activación." />
        </TabsContent>

        <TabsContent value="disable">
          <KeyTable keys={toDisable} emptyMessage="No hay llaves pendientes de baja." />
        </TabsContent>

        <TabsContent value="unchanged">
          <KeyTable keys={unchanged} emptyMessage="No hay llaves activas sin cambios programados." />
        </TabsContent>
      </Tabs>

      {createOpen && buildingId && administrationId && (
        <EquipmentUpdateFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          equipmentId={equipmentId}
          administrationId={administrationId}
          buildingId={buildingId}
          pendingActivate={pendingActivateRows}
          pendingDisable={pendingDisableRows}
          ticketId={`pending-${equipmentId}`}
        />
      )}
    </>
  );
}
