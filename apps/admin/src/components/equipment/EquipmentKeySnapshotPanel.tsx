import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@vitalock/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePendingKeysForEquipment } from '@/hooks/usePendingKeysForEquipment';
import type { PendingKey } from '@/hooks/usePendingKeysForEquipment';

interface EquipmentKeySnapshotPanelProps {
  equipmentId: string;
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
    return (
      <p className="py-4 text-sm text-muted-foreground text-center">{emptyMessage}</p>
    );
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
 */
export function EquipmentKeySnapshotPanel({ equipmentId }: EquipmentKeySnapshotPanelProps) {
  const { data, isLoading, isError } = usePendingKeysForEquipment(equipmentId);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive py-4">
        No se pudo cargar el estado de llaves pendientes.
      </p>
    );
  }

  const toActivate = data?.toActivate ?? [];
  const toDisable = data?.toDisable ?? [];
  const unchanged = data?.unchanged ?? [];

  const handleCopy = async () => {
    const text = formatSnapshotForClipboard(toActivate, toDisable, unchanged);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tabs defaultValue="activate">
      <div className="mb-4 flex items-center justify-between gap-2">
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
        <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
          {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar snapshot'}
        </Button>
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
  );
}
