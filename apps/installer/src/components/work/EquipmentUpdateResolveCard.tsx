import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@vitalock/ui';
import { EquipmentUpdateResolveDetail } from './EquipmentUpdateResolveDetail';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface EquipmentUpdateResolveCardProps {
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
 * Installer card for equipment_update tickets.
 * Distinct from the generic TicketCard — not selectable for batch resolve.
 * Opens EquipmentUpdateResolveDetail on tap.
 */
export function EquipmentUpdateResolveCard({ ticket }: EquipmentUpdateResolveCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <div className="rounded-md border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{ticket.title}</span>
              <span className="text-xs text-muted-foreground">
                Actualización de equipo
              </span>
            </div>
            <Badge variant={statusVariant[ticket.status]} className="shrink-0">
              {statusLabel[ticket.status]}
            </Badge>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      <EquipmentUpdateResolveDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        ticket={ticket}
      />
    </>
  );
}
