import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Badge } from '../badge';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Label } from '../label';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { SearchInput, type SearchInputProps } from './SearchInput';

/**
 * A single facet's self-reported state in the shared registry. Sub-parts
 * register/unregister themselves via `useRegisterFacet`; `FilterBar.Summary`
 * derives "N filtros activos" and per-facet chips from this list alone — no
 * page ever passes a `facets` array or a `hasFilters` boolean directly.
 */
export interface FacetRegistration {
  /** Stable facet key, e.g. 'status'. Unique within one `FilterBar`. */
  id: string;
  /** Human-readable facet label, e.g. 'Estado'. */
  label: string;
  /** Whether this facet currently constrains the result set. */
  active: boolean;
  /** Chip text shown by `Summary`, e.g. 'Estado (3)' or 'Búsqueda: "abc"'. */
  chipLabel: string;
  /**
   * Stable ref holding the facet's own reset function. Reassigned on every
   * render of the owning sub-part (never a hook dependency) so that an
   * inline arrow `onChange`/`onClear` prop from the parent page cannot
   * thrash the registration effect below.
   */
  clearRef: React.MutableRefObject<() => void>;
}

interface FacetContextValue {
  register: (registration: FacetRegistration) => void;
  unregister: (id: string) => void;
  facets: FacetRegistration[];
}

const FacetContext = React.createContext<FacetContextValue | null>(null);

function useFacetContext(componentName: string): FacetContextValue {
  const ctx = React.useContext(FacetContext);
  if (!ctx) {
    throw new Error(`${componentName} must be rendered inside <FilterBar>.`);
  }
  return ctx;
}

interface UseRegisterFacetOptions {
  id: string;
  label: string;
  active: boolean;
  chipLabel: string;
  onClear: () => void;
}

/**
 * Self-registers one facet into the `FacetContext` registry.
 *
 * CRITICAL: `onClear` is stashed into a ref that is reassigned on every
 * render, and is deliberately NOT a dependency of the registration effect.
 * The effect only depends on primitives (`id`, `label`, `active`,
 * `chipLabel`). This is the design's explicit anti-thrash guard: a page
 * that passes an inline arrow function for `onChange`/`onClear` creates a
 * new function identity on every render, and if that identity were a hook
 * dependency the registration effect (register → context state update →
 * re-render) would re-fire every single render, forever. Do not "simplify"
 * this by moving `onClear` into the dependency array.
 */
function useRegisterFacet({ id, label, active, chipLabel, onClear }: UseRegisterFacetOptions) {
  const { register, unregister } = useFacetContext('A FilterBar sub-component');
  const clearRef = React.useRef(onClear);
  clearRef.current = onClear;

  React.useEffect(() => {
    register({ id, label, active, chipLabel, clearRef });
    return () => unregister(id);
    // clearRef/register/unregister are stable by design (see doc comment);
    // onClear is intentionally excluded — it lives behind clearRef instead.
  }, [id, label, active, chipLabel]);
}

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

function FilterBarRoot({ children, className }: FilterBarProps) {
  const [facets, setFacets] = React.useState<FacetRegistration[]>([]);

  const register = React.useCallback((registration: FacetRegistration) => {
    setFacets((prev) => [...prev.filter((facet) => facet.id !== registration.id), registration]);
  }, []);

  const unregister = React.useCallback((id: string) => {
    setFacets((prev) => prev.filter((facet) => facet.id !== id));
  }, []);

  const contextValue = React.useMemo<FacetContextValue>(
    () => ({ register, unregister, facets }),
    [register, unregister, facets],
  );

  return (
    <FacetContext.Provider value={contextValue}>
      <div className={cn('flex flex-wrap items-end gap-3', className)}>{children}</div>
    </FacetContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// FilterBar.Search
// ---------------------------------------------------------------------------

export interface FilterBarSearchProps
  extends Omit<SearchInputProps, 'value' | 'onChange' | 'defaultValue'> {
  /** Facet id. @default 'search' */
  facet?: string;
  /** Facet label used in the Summary chip. @default 'Búsqueda' */
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Debounce delay in ms before `onChange` fires. @default 300 */
  debounceMs?: number;
}

function FilterBarSearch({
  facet = 'search',
  label = 'Búsqueda',
  value,
  onChange,
  debounceMs = 300,
  ...inputProps
}: FilterBarSearchProps) {
  const [draft, setDraft] = React.useState(value);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // Reflect external value changes (e.g. a page-level reset, or this same
  // component's own debounced onChange being echoed back through the
  // page's state) without fighting the user's own typing.
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    if (draft === value) return;
    const handle = setTimeout(() => {
      onChangeRef.current(draft);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [draft, debounceMs]);

  useRegisterFacet({
    id: facet,
    label,
    active: value !== '',
    chipLabel: `${label}: "${value}"`,
    onClear: () => {
      setDraft('');
      onChangeRef.current('');
    },
  });

  return (
    <SearchInput value={draft} onChange={(event) => setDraft(event.target.value)} {...inputProps} />
  );
}

// ---------------------------------------------------------------------------
// FilterBar.Select
// ---------------------------------------------------------------------------

export interface FilterBarSelectOption {
  value: string;
  label: string;
}

export interface FilterBarSelectProps {
  /** Facet id, e.g. 'status'. */
  facet: string;
  /** Facet label — accessible name and Summary chip prefix, e.g. 'Estado'. */
  label: string;
  options: FilterBarSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * `radix` (default) wraps the existing `Select` primitive. `native`
   * renders a real `<select>` element — required for the installer's
   * OS-picker/assistive-tech accessibility contract.
   */
  variant?: 'native' | 'radix';
  /** Sentinel value meaning "no filter applied". @default '' */
  allValue?: string;
  placeholder?: string;
  className?: string;
}

function FilterBarSelect({
  facet,
  label,
  options,
  value,
  onChange,
  variant = 'radix',
  allValue = '',
  placeholder,
  className,
}: FilterBarSelectProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const selectedOption = options.find((option) => option.value === value);

  useRegisterFacet({
    id: facet,
    label,
    active: value !== allValue,
    chipLabel: `${label}: ${selectedOption?.label ?? value}`,
    onClear: () => onChangeRef.current(allValue),
  });

  if (variant === 'native') {
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'border-input bg-card text-foreground ring-offset-background focus-visible:ring-ring flex h-11 rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn('w-auto min-w-[10rem]', className)}>
        <SelectValue placeholder={placeholder ?? label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// FilterBar.MultiSelect
// ---------------------------------------------------------------------------

export interface FilterBarMultiSelectOption {
  value: string;
  label: string;
}

export interface FilterBarMultiSelectProps {
  /** Facet id, e.g. 'kind'. */
  facet: string;
  /** Facet label — trigger text and Summary chip prefix, e.g. 'Tipo'. */
  label: string;
  options: FilterBarMultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

function FilterBarMultiSelect({
  facet,
  label,
  options,
  value,
  onChange,
  className,
}: FilterBarMultiSelectProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  useRegisterFacet({
    id: facet,
    label,
    active: value.length > 0,
    chipLabel: `${label} (${value.length})`,
    onClear: () => onChangeRef.current([]),
  });

  const badgeText =
    value.length === 0
      ? null
      : value.length === 1
        ? (options.find((option) => option.value === value[0])?.label ?? value[0])
        : `${value.length} seleccionados`;

  const toggle = (optionValue: string, checked: boolean) => {
    const next = checked ? [...value, optionValue] : value.filter((entry) => entry !== optionValue);
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn('gap-2', className)}>
          <span>{label}</span>
          {badgeText !== null && <Badge variant="secondary">{badgeText}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {/*
          Real checkbox semantics, not a combobox listbox: the checkbox and
          option role families must not be mixed. `role="group"` groups the
          checkboxes under the facet label; each row is a native <label>
          wrapping a Radix Checkbox button (role="checkbox"), never
          role="option"/role="listbox"/aria-multiselectable. Instant-apply —
          each toggle calls onChange immediately, no pending selection state
          and no "Aplicar" footer (that would require internal pending state,
          which the fully-controlled contract forbids).
        */}
        <div role="group" aria-label={label} className="flex flex-col gap-1">
          {options.map((option) => {
            const checked = value.includes(option.value);
            return (
              <label
                key={option.value}
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => toggle(option.value, next === true)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// FilterBar.Cascade
// ---------------------------------------------------------------------------

/**
 * `packages/ui` cannot import `apps/admin`'s `CascadeFilter` (administration
 * → building → equipment), so this value shape mirrors it structurally
 * without a hard dependency.
 */
export interface FilterBarCascadeValue {
  administrationId: string;
  buildingId: string;
  equipmentId: string;
}

export interface FilterBarCascadeLabels {
  administration: string;
  building: string;
  equipment: string;
}

export interface FilterBarCascadeProps {
  /** Facet id prefix. @default 'cascade' */
  facet?: string;
  value: FilterBarCascadeValue;
  onChange: (value: FilterBarCascadeValue) => void;
  labels: FilterBarCascadeLabels;
  /** Resolves a level's raw id to a display label for its Summary chip. */
  resolveLabel?: (level: 'administration' | 'building' | 'equipment', id: string) => string;
  /** The app's own cascade UI (e.g. `<CascadeFilter>`), rendered untouched. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Registration-only wrapper: `packages/ui` has no access to the app-level
 * cascade filtering logic, so this component does not reimplement it. It
 * only registers one facet per non-empty level (administration/building/
 * equipment) into the shared registry, and renders `children` untouched.
 */
function FilterBarCascade({
  facet = 'cascade',
  value,
  onChange,
  labels,
  resolveLabel,
  children,
  className,
}: FilterBarCascadeProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const display = (level: 'administration' | 'building' | 'equipment', id: string) =>
    resolveLabel ? resolveLabel(level, id) : id;

  useRegisterFacet({
    id: `${facet}.administration`,
    label: labels.administration,
    active: value.administrationId !== '',
    chipLabel: `${labels.administration}: ${display('administration', value.administrationId)}`,
    onClear: () => onChangeRef.current({ administrationId: '', buildingId: '', equipmentId: '' }),
  });

  useRegisterFacet({
    id: `${facet}.building`,
    label: labels.building,
    active: value.buildingId !== '',
    chipLabel: `${labels.building}: ${display('building', value.buildingId)}`,
    onClear: () => onChangeRef.current({ ...valueRef.current, buildingId: '', equipmentId: '' }),
  });

  useRegisterFacet({
    id: `${facet}.equipment`,
    label: labels.equipment,
    active: value.equipmentId !== '',
    chipLabel: `${labels.equipment}: ${display('equipment', value.equipmentId)}`,
    onClear: () => onChangeRef.current({ ...valueRef.current, equipmentId: '' }),
  });

  return <div className={className}>{children}</div>;
}

// ---------------------------------------------------------------------------
// FilterBar.DateRange
// ---------------------------------------------------------------------------

export interface FilterBarDateRangeValue {
  from: string;
  to: string;
}

export interface FilterBarDateRangeProps {
  /** Facet id. @default 'dateRange' */
  facet?: string;
  /** Facet label used in the Summary chip. @default 'Fecha' */
  label?: string;
  value: FilterBarDateRangeValue;
  onChange: (value: FilterBarDateRangeValue) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
}

function FilterBarDateRange({
  facet = 'dateRange',
  label = 'Fecha',
  value,
  onChange,
  fromLabel = 'Desde',
  toLabel = 'Hasta',
  className,
}: FilterBarDateRangeProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  useRegisterFacet({
    id: facet,
    label,
    active: value.from !== '' || value.to !== '',
    chipLabel: `${label}: ${value.from || '…'} – ${value.to || '…'}`,
    onClear: () => onChangeRef.current({ from: '', to: '' }),
  });

  const fromId = `${facet}-from`;
  const toId = `${facet}-to`;

  return (
    <div className={cn('flex items-end gap-2', className)}>
      <div className="flex flex-col gap-1">
        <Label htmlFor={fromId}>{fromLabel}</Label>
        <Input
          id={fromId}
          type="date"
          value={value.from}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={toId}>{toLabel}</Label>
        <Input
          id={toId}
          type="date"
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterBar.Summary
// ---------------------------------------------------------------------------

export interface FilterBarSummaryProps {
  className?: string;
  clearAllLabel?: string;
}

function activeCountLabel(count: number): string {
  return count === 1 ? '1 filtro activo' : `${count} filtros activos`;
}

function FilterBarSummary({ className, clearAllLabel = 'Limpiar todo' }: FilterBarSummaryProps) {
  const { facets } = useFacetContext('FilterBar.Summary');
  const activeFacets = facets.filter((facet) => facet.active);

  const clearAll = () => {
    facets.forEach((facet) => facet.clearRef.current());
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-muted-foreground text-sm">{activeCountLabel(activeFacets.length)}</span>
      {activeFacets.map((facet) => (
        <Badge key={facet.id} variant="secondary" className="gap-1 pr-1">
          <span>{facet.chipLabel}</span>
          <button
            type="button"
            aria-label={`Quitar filtro ${facet.label}`}
            onClick={() => facet.clearRef.current()}
            className="hover:bg-muted-foreground/20 rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
        {clearAllLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

type FilterBarComponent = typeof FilterBarRoot & {
  Search: typeof FilterBarSearch;
  Select: typeof FilterBarSelect;
  MultiSelect: typeof FilterBarMultiSelect;
  Cascade: typeof FilterBarCascade;
  DateRange: typeof FilterBarDateRange;
  Summary: typeof FilterBarSummary;
};

const FilterBar = FilterBarRoot as FilterBarComponent;
FilterBar.Search = FilterBarSearch;
FilterBar.Select = FilterBarSelect;
FilterBar.MultiSelect = FilterBarMultiSelect;
FilterBar.Cascade = FilterBarCascade;
FilterBar.DateRange = FilterBarDateRange;
FilterBar.Summary = FilterBarSummary;

export { FilterBar };
