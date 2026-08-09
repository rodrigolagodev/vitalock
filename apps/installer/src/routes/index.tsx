import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorklist } from '@/hooks/useWorklist';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import type { WorklistAuthorization } from '@/hooks/useWorklist';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ConnectivityBanner } from '@/components/common/ConnectivityBanner';
import { BuildingWorkCard } from '@/components/work/BuildingWorkCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Building {
  building: { id: string; name: string };
  administration: { id: string; company_name: string };
  authorizations: WorklistAuthorization[];
  tickets: AssignedTicket[];
}

// ---------------------------------------------------------------------------
// Merge helper — combines authorizations + tickets into Building[] via useMemo.
// No DB round-trip; purely client-side grouping. Satisfies installer-home R5.
// ---------------------------------------------------------------------------

function mergeIntoBuildings(
  authorizations: WorklistAuthorization[],
  tickets: AssignedTicket[],
): Building[] {
  const map = new Map<string, Building>();

  for (const auth of authorizations) {
    const bid = auth.equipment.building.id;
    if (!map.has(bid)) {
      map.set(bid, {
        building: {
          id: auth.equipment.building.id,
          name: auth.equipment.building.name,
        },
        administration: auth.equipment.building.administration,
        authorizations: [],
        tickets: [],
      });
    }
    map.get(bid)!.authorizations.push(auth);
  }

  for (const ticket of tickets) {
    const bid = ticket.building.id;
    if (!map.has(bid)) {
      map.set(bid, {
        building: { id: ticket.building.id, name: ticket.building.name },
        administration: ticket.building.administration,
        authorizations: [],
        tickets: [],
      });
    }
    map.get(bid)!.tickets.push(ticket);
  }

  // Sort A-Z by building name. Satisfies installer-home R1.
  return [...map.values()].sort((a, b) =>
    a.building.name.localeCompare(b.building.name, 'es'),
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton — 3 card placeholders for initial load (R4-SC1)
// ---------------------------------------------------------------------------

function LoadingSkeletons() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border p-4 flex flex-col gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

/**
 * HomePage — the installer's daily-driver screen.
 *
 * Merges useWorklist + useAssignedTickets into Building[] via useMemo;
 * renders one BuildingWorkCard per building.
 *
 * Satisfies installer-home R1-R8.
 */
export default function IndexRoute() {
  const worklist = useWorklist();
  const assignedTickets = useAssignedTickets();

  const isLoading =
    (worklist.isLoading && !worklist.data) ||
    (assignedTickets.isLoading && !assignedTickets.data);

  const isFetching = worklist.isFetching || assignedTickets.isFetching;

  const buildings = useMemo(
    () =>
      mergeIntoBuildings(
        worklist.data ?? [],
        assignedTickets.data ?? [],
      ),
    [worklist.data, assignedTickets.data],
  );

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mi turno</h1>
        {isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Actualizando" />
        )}
      </div>

      {/* Connectivity banner — non-blocking */}
      <ConnectivityBanner />

      {/* Content */}
      {isLoading ? (
        <LoadingSkeletons />
      ) : buildings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {buildings.map((b) => (
            <BuildingWorkCard
              key={b.building.id}
              building={b.building}
              administration={b.administration}
              authorizations={b.authorizations}
              tickets={b.tickets}
            />
          ))}
        </div>
      )}
    </div>
  );
}
