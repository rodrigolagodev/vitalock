import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AuthorizationsSection } from './AuthorizationsSection';
import { TicketsSection } from './TicketsSection';
import type { WorklistAuthorization } from '@/hooks/useWorklist';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

export interface BuildingWorkCardProps {
  building: { id: string; name: string };
  administration: { id: string; company_name: string };
  authorizations: WorklistAuthorization[];
  tickets: AssignedTicket[];
}

/**
 * BuildingWorkCard — one card per building the installer must visit.
 * Header: building name + administration badge + summary counts ("N llaves / M tickets").
 * Body: AuthorizationsSection ("Llaves") + TicketsSection ("Trabajos").
 * Satisfies installer-home R1, R2.
 */
export function BuildingWorkCard({
  building,
  administration,
  authorizations,
  tickets,
}: BuildingWorkCardProps) {
  const keyCount = authorizations.length;
  const ticketCount = tickets.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">{building.name}</CardTitle>
            <Badge variant="secondary" className="w-fit text-xs">
              {administration.company_name}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {keyCount} {keyCount === 1 ? 'llave' : 'llaves'} / {ticketCount}{' '}
            {ticketCount === 1 ? 'ticket' : 'tickets'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        <AuthorizationsSection authorizations={authorizations} />
        {authorizations.length > 0 && tickets.length > 0 && (
          <Separator className="my-1" />
        )}
        <TicketsSection tickets={tickets} />
      </CardContent>
    </Card>
  );
}
