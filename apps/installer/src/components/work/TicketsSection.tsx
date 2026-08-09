import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { TicketCard } from './TicketCard';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface TicketsSectionProps {
  tickets: AssignedTicket[];
}

/**
 * Sort order: status priority (in_progress before open), then opened_at ascending.
 * Satisfies tickets R1-SC3.
 */
const statusOrder: Record<AssignedTicket['status'], number> = {
  in_progress: 0,
  open: 1,
};

/**
 * TicketsSection — collapsible "Trabajos" sub-section.
 * Returns null when the tickets array is empty.
 * Defaults to expanded. Satisfies installer-home R6, tickets R1-SC3, R6.
 */
export function TicketsSection({ tickets }: TicketsSectionProps) {
  const [open, setOpen] = useState(true);

  if (tickets.length === 0) return null;

  const sorted = [...tickets].sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.opened_at.localeCompare(b.opened_at);
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
        <span>Trabajos ({tickets.length})</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pb-2">
          {sorted.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
