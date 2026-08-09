import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTicketComments } from '@/hooks/useTicketComments';
import { TicketCommentsList } from './TicketCommentsList';
import { AddCommentForm } from './AddCommentForm';
import { ResolveTicketForm } from './ResolveTicketForm';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface TicketCardProps {
  ticket: AssignedTicket;
}

const statusLabel: Record<AssignedTicket['status'], string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
};

const statusVariant: Record<AssignedTicket['status'], 'default' | 'secondary'> = {
  open: 'default',
  in_progress: 'secondary',
};

/**
 * TicketCard — collapsed: title + status badge.
 *              expanded: description + comments + add comment form + resolve form.
 * Satisfies tickets R1, R2, R3.
 */
export function TicketCard({ ticket }: TicketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: comments = [] } = useTicketComments(expanded ? ticket.id : '');

  return (
    <div className="flex flex-col rounded-md border bg-background overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">{ticket.title}</span>
          <Badge variant={statusVariant[ticket.status]} className="shrink-0">
            {statusLabel[ticket.status]}
          </Badge>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <Separator />
          {ticket.description && (
            <p className="text-sm text-muted-foreground">{ticket.description}</p>
          )}
          <TicketCommentsList comments={comments} />
          <AddCommentForm ticketId={ticket.id} />
          <ResolveTicketForm ticketId={ticket.id} />
        </div>
      )}
    </div>
  );
}
