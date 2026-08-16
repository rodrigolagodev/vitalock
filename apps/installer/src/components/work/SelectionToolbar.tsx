import { Button } from '@vitalock/ui';
import { X } from 'lucide-react';

interface SelectionToolbarProps {
  count: number;
  isPending?: boolean;
  onConfirm: () => void;
  onClear: () => void;
  label?: string;
}

export function SelectionToolbar({
  count,
  isPending = false,
  onConfirm,
  onClear,
  label = 'Marcar hechas',
}: SelectionToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={onClear}
          disabled={isPending}
          className="rounded-full p-1 hover:bg-muted"
          aria-label="Deseleccionar todo"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          {count} seleccionada{count === 1 ? '' : 's'}
        </span>
        <Button size="sm" onClick={onConfirm} disabled={isPending}>
          {isPending ? 'Guardando...' : label}
        </Button>
      </div>
    </div>
  );
}
