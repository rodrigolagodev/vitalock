import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@vitalock/ui';
import { Checkbox } from '@vitalock/ui';
import { Separator } from '@/components/ui/separator';
import { useTicketComments } from '@/hooks/useTicketComments';
import { TicketCommentsList } from './TicketCommentsList';
import { AddCommentForm } from './AddCommentForm';
import { ConfigureEquipmentInline } from './ConfigureEquipmentInline';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface TicketCardProps {
  ticket: AssignedTicket;
  selected: boolean;
  onToggle: (id: string) => void;
}

const statusLabel: Record<AssignedTicket['status'], string> = {
  open: 'Pendiente',
  in_progress: 'En curso',
};

const statusVariant: Record<AssignedTicket['status'], 'default' | 'secondary'> = {
  open: 'default',
  in_progress: 'secondary',
};

const TWO_STEP_CATEGORIES: readonly string[] = [
  'equipment_installation',
  'equipment_replacement',
];

export function TicketCard({ ticket, selected, onToggle }: TicketCardProps) {
  const isTwoStep = TWO_STEP_CATEGORIES.includes(ticket.category);
  const needsConfigure = isTwoStep && !ticket.pending_new_serial;
  // Auto-expand two-step tickets so the installer sees the configure form
  // without an extra tap the first time the card renders.
  const [expanded, setExpanded] = useState(needsConfigure);
  const { data: comments = [] } = useTicketComments(expanded ? ticket.id : '');

  // When a ticket flips from needing configure to configured (or back),
  // keep the card open so the operator can see the state change reflected.
  useEffect(() => {
    if (needsConfigure) setExpanded(true);
  }, [needsConfigure]);

  const checkboxDisabled = needsConfigure;

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-md border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <Checkbox
            id={`ticket-${ticket.id}`}
            checked={selected}
            disabled={checkboxDisabled}
            aria-label={
              checkboxDisabled
                ? 'Cargá el equipo antes de finalizar la tarea'
                : undefined
            }
            onCheckedChange={() => {
              if (!checkboxDisabled) onToggle(ticket.id);
            }}
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
            {isTwoStep && <ConfigureEquipmentInline ticket={ticket} />}
            <TicketCommentsList comments={comments} />
            <AddCommentForm ticketId={ticket.id} />
          </div>
        )}
      </div>
    </>
  );
}
