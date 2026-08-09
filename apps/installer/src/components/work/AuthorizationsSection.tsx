import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EquipmentGroup } from './EquipmentGroup';
import type { WorklistAuthorization } from '@/hooks/useWorklist';

interface AuthorizationsSectionProps {
  authorizations: WorklistAuthorization[];
}

/**
 * AuthorizationsSection — collapsible "Llaves" sub-section.
 * Returns null (not rendered) when the authorizations array is empty.
 * Defaults to expanded. Groups authorizations by equipment, sorted A-Z.
 * Satisfies installer-home R6, worklist R5.
 */
export function AuthorizationsSection({ authorizations }: AuthorizationsSectionProps) {
  const [open, setOpen] = useState(true);

  if (authorizations.length === 0) return null;

  // Group by equipment, sorted alphabetically by description
  const groupMap = new Map<string, { description: string; items: WorklistAuthorization[] }>();
  for (const auth of authorizations) {
    const key = auth.equipment.id;
    if (!groupMap.has(key)) {
      groupMap.set(key, { description: auth.equipment.description, items: [] });
    }
    groupMap.get(key)!.items.push(auth);
  }
  const groups = [...groupMap.values()].sort((a, b) =>
    a.description.localeCompare(b.description, 'es'),
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
        <span>Llaves ({authorizations.length})</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 pb-2">
          {groups.map((group) => (
            <EquipmentGroup
              key={group.description}
              description={group.description}
              authorizations={group.items}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
