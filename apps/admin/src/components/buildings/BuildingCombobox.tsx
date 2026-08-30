import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { SearchInput } from '@vitalock/ui';
import type { BuildingRow } from '@/hooks/useBuildings';

interface BuildingComboboxProps {
  /** Full building list to search across (client-side filter). */
  buildings: BuildingRow[];
  /** Currently selected building id (or empty string / null when unset). */
  value: string | null | undefined;
  /** Emits the new building id, or null when cleared. */
  onChange: (buildingId: string | null) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export function BuildingCombobox({
  buildings,
  value,
  onChange,
  className,
  disabled = false,
  placeholder = 'Buscar edificio',
  id,
}: BuildingComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => buildings.find((b) => b.id === value) ?? null,
    [buildings, value],
  );

  const searching = query.trim() !== '';
  const showInputValue = !searching;

  const filtered = useMemo(() => {
    if (!searching) return buildings;
    const q = query.trim().toLowerCase();
    return buildings.filter((b) => {
      const name = b.name.toLowerCase();
      const address = (b.address ?? '').toLowerCase();
      return name.includes(q) || address.includes(q);
    });
  }, [buildings, query, searching]);

  const handleSelect = (building: BuildingRow) => {
    onChange(building.id);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setOpen(false);
  };

  const displayValue = selected
    ? selected.address
      ? `${selected.name} — ${selected.address}`
      : selected.name
    : '';

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative">
        <SearchInput
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label="Buscar edificio"
          placeholder={placeholder}
          className="pr-9"
          value={showInputValue ? displayValue : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
        />
        {selected && showInputValue && !disabled && (
          <button
            type="button"
            aria-label="Quitar edificio"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!disabled && open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-md">
          {filtered.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Resultados de búsqueda"
              className="max-h-56 overflow-y-auto py-1"
            >
              {filtered.map((building) => (
                <li key={building.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === building.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(building)}
                    className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="font-medium">{building.name}</span>
                    {building.address && (
                      <span className="text-xs text-muted-foreground">
                        {building.address}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No se encontraron edificios
            </p>
          )}
        </div>
      )}
    </div>
  );
}
