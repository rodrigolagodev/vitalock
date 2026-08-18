import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { TicketCard } from './TicketCard';
import { EquipmentUpdateResolveCard } from './EquipmentUpdateResolveCard';
import { SelectionToolbar } from './SelectionToolbar';
import { useResolveTickets } from '@/hooks/useResolveTickets';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface TicketsSectionProps {
  tickets: AssignedTicket[];
}

const statusOrder: Record<AssignedTicket['status'], number> = {
  in_progress: 0,
  open: 1,
};

/**
 * Ticket categories excluded from the installer's batch-resolve toolbar.
 * - equipment_installation / equipment_replacement: resolved by the admin only.
 * - equipment_update: resolved by the installer via dedicated EquipmentUpdateResolveCard.
 */
const EXCLUDED_FOR_BATCH: readonly string[] = [
  'equipment_installation',
  'equipment_replacement',
  'equipment_update',
];

/** Categories the installer resolves individually (not admin-only). */
const INSTALLER_RESOLVE_CATEGORIES: readonly string[] = ['equipment_update'];

export function TicketsSection({ tickets }: TicketsSectionProps) {
  const [open, setOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const resolve = useResolveTickets();

  const sorted = useMemo(
    () =>
      [...tickets].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        return a.opened_at.localeCompare(b.opened_at);
      }),
    [tickets],
  );

  // Tickets the installer can batch-resolve (stock-neutral categories).
  const selectable = useMemo(
    () => sorted.filter((t) => !EXCLUDED_FOR_BATCH.includes(t.category)),
    [sorted],
  );

  // Tickets the installer resolves individually (equipment_update with dedicated UI).
  const installerResolve = useMemo(
    () => sorted.filter((t) => INSTALLER_RESOLVE_CATEGORIES.includes(t.category)),
    [sorted],
  );

  // Tickets that only the admin can complete (equipment_installation / equipment_replacement).
  const pendingAdmin = useMemo(
    () =>
      sorted.filter(
        (t) =>
          EXCLUDED_FOR_BATCH.includes(t.category) &&
          !INSTALLER_RESOLVE_CATEGORIES.includes(t.category),
      ),
    [sorted],
  );

  if (tickets.length === 0) return null;

  const handleToggle = (id: string) => {
    // Only selectable tickets can be toggled; pendingAdmin and installerResolve
    // tickets are never included in selectedIds.
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    resolve.mutate(
      { ids: [...selectedIds] },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
          <span>Trabajos ({tickets.length})</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 pb-2">
            {selectable.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                selected={selectedIds.has(ticket.id)}
                onToggle={handleToggle}
              />
            ))}

            {installerResolve.map((ticket) => (
              <EquipmentUpdateResolveCard
                key={ticket.id}
                ticket={ticket}
              />
            ))}

            {pendingAdmin.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {pendingAdmin.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{ticket.title}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        Pendiente de admin
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <SelectionToolbar
        count={selectedIds.size}
        isPending={resolve.isPending}
        onConfirm={handleConfirm}
        onClear={() => setSelectedIds(new Set())}
        label="Marcar resueltos"
      />
    </>
  );
}
