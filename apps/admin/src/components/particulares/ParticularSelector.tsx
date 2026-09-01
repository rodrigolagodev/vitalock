import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, SearchInput } from '@vitalock/ui';
import { useParticulares } from '@/hooks/useParticulares';
import type { ParticularRow } from '@/hooks/useParticulares';
import { QuickParticularCreateDialog } from './QuickParticularCreateDialog';

interface ParticularSelectorProps {
  /** Currently bound particular (full row — the parent keeps the source of truth). */
  value?: ParticularRow | null;
  /** Emits the full selected particular; null clears the binding. */
  onChange: (particular: ParticularRow | null) => void;
  className?: string;
  /** Blocks input, clear button, and dropdown when true. */
  disabled?: boolean;
  /** When set, an "Editar" link appears next to the selected particular. */
  onEdit?: (particular: ParticularRow) => void;
}

/**
 * Server-side search combobox over particulares (useAdministrations pattern).
 * Typing debounces inside useParticulares before the PostgREST `.or()` fires.
 * When the debounced search yields no matches, the empty state opens
 * QuickParticularCreateDialog for inline creation; the created particular is
 * emitted through the same onChange contract.
 */
export function ParticularSelector({
  value,
  onChange,
  className,
  disabled = false,
  onEdit,
}: ParticularSelectorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: results = [], isFetching, isSearchPending } = useParticulares({
    search: query,
  });

  const searching = query.trim() !== '';
  const showInputValue = !searching;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    setOpen(true);
    // If the user clears the input while a particular is bound, treat the
    // empty text as an intent to unbind. Without this, `showInputValue`
    // flips back to true (query === '') and the selected name reappears —
    // trapping the user until they click the X clear button.
    if (next === '' && value) {
      onChange(null);
    }
  };

  const handleSelect = (particular: ParticularRow) => {
    onChange(particular);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setOpen(false);
  };

  const handleCreated = (particular: ParticularRow) => {
    setCreateOpen(false);
    // Same binding path as picking from the list — the dialog persists first,
    // then the enclosing flow binds the created row.
    handleSelect(particular);
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative">
        <SearchInput
          role="combobox"
          aria-expanded={open && searching}
          aria-label="Buscar particular"
          placeholder="Buscar particular"
          className={value && showInputValue && !disabled && onEdit ? 'pr-24' : 'pr-9'}
          value={showInputValue ? (value?.full_name ?? '') : query}
          onChange={handleInputChange}
          disabled={disabled}
          onFocus={() => {
            if (query.trim() !== '') setOpen(true);
          }}
          onBlur={() => {
            // Delay so option clicks land before the dropdown closes.
            window.setTimeout(() => setOpen(false), 150);
          }}
        />
        {value && showInputValue && !disabled && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(value)}
                className="rounded px-1.5 py-0.5 text-xs text-primary hover:underline"
              >
                Editar
              </button>
            )}
            <button
              type="button"
              aria-label="Quitar particular"
              onClick={handleClear}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!disabled && open && searching && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-md">
          {isSearchPending || isFetching ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>
          ) : results.length > 0 ? (
            <ul role="listbox" aria-label="Resultados de búsqueda" className="max-h-56 overflow-y-auto py-1">
              {results.map((particular) => {
                const locationParts = [
                  particular.building_name,
                  particular.unit_number ? `Unidad ${particular.unit_number}` : null,
                ].filter(Boolean);
                return (
                  <li key={particular.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value?.id === particular.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(particular)}
                      className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="font-medium">{particular.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        DNI {particular.dni}
                        {locationParts.length > 0 && ` · ${locationParts.join(' · ')}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              <p className="text-sm text-muted-foreground">
                No se encontraron resultados
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                Crear particular
              </Button>
            </div>
          )}
        </div>
      )}

      <QuickParticularCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
