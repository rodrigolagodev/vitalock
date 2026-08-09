import { CheckCircle2 } from 'lucide-react';

/**
 * EmptyState — shown when the installer has no pending work in any building.
 * Satisfies installer-home R3, SC-R3-1.
 */
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <CheckCircle2 className="h-16 w-16 text-green-500" aria-hidden />
      <p className="text-lg font-medium text-muted-foreground">
        Estás al día. No tenés tareas pendientes.
      </p>
    </div>
  );
}
