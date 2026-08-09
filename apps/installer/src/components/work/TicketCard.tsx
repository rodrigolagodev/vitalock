import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useTicketComments } from '@/hooks/useTicketComments';
import { useCancelTicket } from '@/hooks/useCancelTicket';
import { TicketCommentsList } from './TicketCommentsList';
import { AddCommentForm } from './AddCommentForm';
import { RejectDialog } from './RejectDialog';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface TicketCardProps {
  ticket: AssignedTicket;
  selected: boolean;
  onToggle: (id: string) => void;
}

const statusLabel: Record<AssignedTicket['status'], string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
};

const statusVariant: Record<AssignedTicket['status'], 'default' | 'secondary'> = {
  open: 'default',
  in_progress: 'secondary',
};

export function TicketCard({ ticket, selected, onToggle }: TicketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const { data: comments = [] } = useTicketComments(expanded ? ticket.id : '');
  const cancel = useCancelTicket();

  const handleReject = (reason: string) => {
    cancel.mutate(
      { id: ticket.id, reason },
      { onSuccess: () => setRejectOpen(false) },
    );
  };

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-md border bg-background">
        <div className="flex items-center gap-2 px-3 py-2">
          <Checkbox
            id={`ticket-${ticket.id}`}
            checked={selected}
            onCheckedChange={() => onToggle(ticket.id)}
            disabled={cancel.isPending}
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left transition-colors hover:bg-muted/50"
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
        </div>

        {expanded && (
          <div className="flex flex-col gap-3 px-3 pb-3">
            <Separator />
            {ticket.description && (
              <p className="text-sm text-muted-foreground">{ticket.description}</p>
            )}
            <TicketCommentsList comments={comments} />
            <AddCommentForm ticketId={ticket.id} />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRejectOpen(true)}
                disabled={cancel.isPending}
              >
                Rechazar ticket
              </Button>
            </div>
          </div>
        )}
      </div>

      <RejectDialog
        open={rejectOpen}
        title="Rechazar ticket"
        description={ticket.title}
        isPending={cancel.isPending}
        onCancel={() => setRejectOpen(false)}
        onConfirm={handleReject}
      />
    </>
  );
}
