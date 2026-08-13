import { Checkbox } from '@vitalock/ui';
import { AuthorizationRow } from './AuthorizationRow';
import type { WorklistAuthorization } from '@/hooks/useWorklist';

interface EquipmentGroupProps {
  description: string;
  authorizations: WorklistAuthorization[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (ids: string[], allSelected: boolean) => void;
}

export function EquipmentGroup({
  description,
  authorizations,
  selectedIds,
  onToggle,
  onToggleGroup,
}: EquipmentGroupProps) {
  const ids = authorizations.map((a) => a.id);
  const selectedInGroup = ids.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectedInGroup === ids.length;
  const partial = selectedInGroup > 0 && selectedInGroup < ids.length;
  const groupId = `group-${authorizations[0]?.equipment.id ?? description}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={groupId}
          checked={allSelected ? true : partial ? 'indeterminate' : false}
          onCheckedChange={() => onToggleGroup(ids, allSelected)}
        />
        <label
          htmlFor={groupId}
          className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {description}
        </label>
      </div>
      <div className="flex flex-col gap-2 pl-6">
        {authorizations.map((auth) => (
          <AuthorizationRow
            key={auth.id}
            authorization={auth}
            selected={selectedIds.has(auth.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
