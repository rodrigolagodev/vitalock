import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { TicketCard } from './TicketCard';
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
            {sorted.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                selected={selectedIds.has(ticket.id)}
                onToggle={handleToggle}
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
