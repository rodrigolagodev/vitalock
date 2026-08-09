import { AuthorizationRow } from './AuthorizationRow';
import type { WorklistAuthorization } from '@/hooks/useWorklist';

interface EquipmentGroupProps {
  description: string;
  authorizations: WorklistAuthorization[];
}

/**
 * EquipmentGroup — equipment description header + list of AuthorizationRows.
 * Equipment groups are sorted A-Z by description (caller responsibility).
 * Satisfies worklist R1-SC1.
 */
export function EquipmentGroup({ description, authorizations }: EquipmentGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {description}
      </p>
      <div className="flex flex-col gap-2">
        {authorizations.map((auth) => (
          <AuthorizationRow key={auth.id} authorization={auth} />
        ))}
      </div>
    </div>
  );
}
