import { SectionHeading } from '@vitalock/ui';
import { formatDateTime } from '@/lib/format';
import { isClosedTareaStatus, ticketClosedAt } from '@/lib/status/tareaStatus';
import type { TicketDetail } from '@/hooks/useAssignedTickets';

interface TaskResolutionCardProps {
  ticket: Pick<
    TicketDetail,
    'status' | 'resolved_at' | 'updated_at' | 'resolution_notes' | 'cancellation_reason'
  >;
}

const COPY = {
  resolved: {
    title: 'Resolución',
    dateLabel: 'Resuelta el',
    notesLabel: 'Notas de resolución',
  },
  cancelled: {
    title: 'Cancelación',
    dateLabel: 'Cancelada el',
    notesLabel: 'Motivo de cancelación',
  },
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

/**
 * TaskResolutionCard — read-only closing summary of a resolved or cancelled
 * task. Renders nothing while the task is still active so the detail page
 * can mount it unconditionally.
 */
export function TaskResolutionCard({ ticket }: TaskResolutionCardProps) {
  if (!isClosedTareaStatus(ticket.status)) return null;

  const copy = ticket.status === 'cancelled' ? COPY.cancelled : COPY.resolved;
  const notes =
    ticket.status === 'cancelled' ? ticket.cancellation_reason : ticket.resolution_notes;

  return (
    <section className="bg-card flex flex-col gap-3 rounded-md border p-4" aria-label={copy.title}>
      <SectionHeading title={copy.title} variant="secondary" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Row label={copy.dateLabel} value={formatDateTime(ticketClosedAt(ticket))} />
        <Row label={copy.notesLabel} value={notes?.trim() ? notes : '—'} />
      </div>
    </section>
  );
}
