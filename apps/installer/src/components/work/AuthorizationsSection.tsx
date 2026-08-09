import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EquipmentGroup } from './EquipmentGroup';
import { SelectionToolbar } from './SelectionToolbar';
import { useCompleteAuthorizations } from '@/hooks/useCompleteAuthorizations';
import type { WorklistAuthorization } from '@/hooks/useWorklist';

interface AuthorizationsSectionProps {
  authorizations: WorklistAuthorization[];
}

export function AuthorizationsSection({ authorizations }: AuthorizationsSectionProps) {
  const [open, setOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const complete = useCompleteAuthorizations();

  const groups = useMemo(() => {
    const map = new Map<string, { description: string; items: WorklistAuthorization[] }>();
    for (const auth of authorizations) {
      const key = auth.equipment.id;
      if (!map.has(key)) {
        map.set(key, { description: auth.equipment.description, items: [] });
      }
      map.get(key)!.items.push(auth);
    }
    return [...map.values()].sort((a, b) =>
      a.description.localeCompare(b.description, 'es'),
    );
  }, [authorizations]);

  if (authorizations.length === 0) return null;

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleGroup = (ids: string[], allSelected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleConfirm = () => {
    const items = authorizations
      .filter((a) => selectedIds.has(a.id))
      .map((a) => ({ id: a.id, sync_state: a.sync_state }));
    complete.mutate(
      { items },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  return (
    <>
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
                selectedIds={selectedIds}
                onToggle={handleToggle}
                onToggleGroup={handleToggleGroup}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <SelectionToolbar
        count={selectedIds.size}
        isPending={complete.isPending}
        onConfirm={handleConfirm}
        onClear={() => setSelectedIds(new Set())}
      />
    </>
  );
}
