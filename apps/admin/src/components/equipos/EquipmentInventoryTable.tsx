import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable } from '@vitalock/ui';
import type { EquipmentInventoryRow } from '@/hooks/useEquipmentInventory';

interface EquipmentInventoryTableProps {
  rows: EquipmentInventoryRow[];
  isFetching?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  dead: 'Dado de baja',
};

export function EquipmentInventoryTable({
  rows,
  isFetching = false,
}: EquipmentInventoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <DataTable<EquipmentInventoryRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(r) => r.id ?? ''}
      emptyMessage="No hay equipos registrados en el inventario."
      columns={[
        {
          header: 'Número de serie',
          cell: (r) => (
            <span className="font-mono text-sm">{r.serial_number ?? '—'}</span>
          ),
        },
        {
          header: 'Modelo',
          cell: (r) => r.model ?? '—',
        },
        {
          header: 'Estado',
          cell: (r) => STATUS_LABELS[r.status ?? ''] ?? r.status ?? '—',
        },
        {
          header: 'Edificio',
          cell: (r) => r.building_name ?? '—',
        },
        {
          header: 'Administración',
          cell: (r) => r.administration_company_name ?? '—',
        },
        {
          header: 'Llaves',
          cell: (r) => {
            const count = r.key_count ?? 0;
            const labels = r.key_labels ?? [];
            const id = r.id ?? '';
            const isExpanded = expandedId === id;

            if (count === 0) {
              return <span>{count}</span>;
            }

            return (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label={`Ver llaves de ${r.serial_number ?? id}`}
                  className="flex items-center gap-1 text-sm text-left hover:underline"
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {count}
                </button>
                {isExpanded && (
                  <ul className="ml-4 flex flex-col gap-0.5">
                    {labels.map((label) => (
                      <li key={label} className="font-mono text-xs text-muted-foreground">
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          },
        },
      ]}
    />
  );
}
