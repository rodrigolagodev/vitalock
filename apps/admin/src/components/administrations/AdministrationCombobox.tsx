import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { SearchInput } from '@vitalock/ui';
import type { AdministrationRow } from '@/hooks/useAdministrations';

interface AdministrationComboboxProps {
  /** Full administration list to search across (client-side filter). */
  administrations: AdministrationRow[];
  /** Currently selected administration id (or empty string / null when unset). */
  value: string | null | undefined;
  /** Emits the new administration id, or null when cleared. */
  onChange: (administrationId: string | null) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

/**
 * Client-side search combobox over administrations (BuildingCombobox pattern).
 * The list is already fully loaded by the caller, so filtering is instant —
 * no server search, debounce, or loading states needed. Opening the dropdown
 * shows the whole list; typing filters by company name or CUIT/CUIL.
 */
export function AdministrationCombobox({
  administrations,
  value,
  onChange,
  className,
  disabled = false,
  placeholder = 'Buscar administración',
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: AdministrationComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => administrations.find((a) => a.id === value) ?? null,
    [administrations, value],
  );

  const searching = query.trim() !== '';
  const showInputValue = !searching;

  const filtered = useMemo(() => {
    if (!searching) return administrations;
    const q = query.trim().toLowerCase();
    return administrations.filter((a) => {
      const name = a.company_name.toLowerCase();
      const taxId = (a.tax_id ?? '').toLowerCase();
      return name.includes(q) || taxId.includes(q);
    });
  }, [administrations, query, searching]);

  const handleSelect = (administration: AdministrationRow) => {
    onChange(administration.id);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setOpen(false);
  };

  const displayValue = selected
    ? selected.tax_id
      ? `${selected.company_name} — ${selected.tax_id}`
      : selected.company_name
    : '';

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative">
        <SearchInput
          id={id}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          role="combobox"
          aria-expanded={open}
          aria-label="Buscar administración"
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
            aria-label="Quitar administración"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!disabled && open && (
        <div className="bg-popover absolute left-0 right-0 top-full z-50 mt-1 rounded-md border shadow-md">
          {filtered.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Resultados de búsqueda"
              className="max-h-56 overflow-y-auto py-1"
            >
              {filtered.map((administration) => (
                <li key={administration.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === administration.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(administration)}
                    className="hover:bg-accent hover:text-accent-foreground flex w-full flex-col px-3 py-2 text-left text-sm"
                  >
                    <span className="font-medium">{administration.company_name}</span>
                    {administration.tax_id && (
                      <span className="text-muted-foreground text-xs">{administration.tax_id}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-3 py-2 text-sm">
              No se encontraron administraciones
            </p>
          )}
        </div>
      )}
    </div>
  );
}
