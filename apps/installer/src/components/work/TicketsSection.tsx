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
 * update_equipment has its own dedicated resolve card (EquipmentUpdateResolveCard).
 * install_equipment / replace_equipment participate in the batch
 * resolve once the installer has configured pending_new_serial; TicketCard
 * disables the checkbox until then.
 */
const EXCLUDED_FOR_BATCH: readonly string[] = ['update_equipment'];

/** Categories the installer resolves individually (not admin-only). */
const INSTALLER_RESOLVE_CATEGORIES: readonly string[] = ['update_equipment'];

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

  // Tickets the installer can batch-resolve (stock-neutral categories +
  // configured equipment tickets).
  const selectable = useMemo(
    () => sorted.filter((t) => !EXCLUDED_FOR_BATCH.includes(t.category)),
    [sorted],
  );

  // Tickets the installer resolves individually (equipment_update with dedicated UI).
  const installerResolve = useMemo(
    () => sorted.filter((t) => INSTALLER_RESOLVE_CATEGORIES.includes(t.category)),
    [sorted],
  );

  if (tickets.length === 0) return null;

  const handleToggle = (id: string) => {
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
