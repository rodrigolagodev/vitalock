import { useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Import through the package entry point — the public contract consumers
// (admin + installer) will rely on.
import { FilterBar } from '@vitalock/ui';

const KIND_OPTIONS = [
  { value: 'key', label: 'Llaves' },
  { value: 'technical', label: 'Técnico' },
];

describe('FilterBar registry & Summary — facet-counted active filters', () => {
  it('counts a multi-select facet with 3 selected values as 1 active filter, not 3', () => {
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="status"
          label="Estado"
          options={[
            { value: 'draft', label: 'Borrador' },
            { value: 'confirmed', label: 'Confirmado' },
            { value: 'in_progress', label: 'En curso' },
          ]}
          value={['draft', 'confirmed', 'in_progress']}
          onChange={() => {}}
        />
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.getByText('1 filtro activo')).toBeInTheDocument();
    expect(screen.getByText('Estado (3)')).toBeInTheDocument();
  });

  it('drops a facet chip from Summary when its sub-component unmounts', () => {
    function Wrapper({ showSearch }: { showSearch: boolean }) {
      return (
        <FilterBar>
          {showSearch && (
            <FilterBar.Search value="llaves" onChange={() => {}} placeholder="Buscar..." />
          )}
          <FilterBar.Summary />
        </FilterBar>
      );
    }

    const { rerender } = render(<Wrapper showSearch />);
    expect(screen.getByText('1 filtro activo')).toBeInTheDocument();

    rerender(<Wrapper showSearch={false} />);
    expect(screen.getByText('0 filtros activos')).toBeInTheDocument();
  });
});

describe('FilterBar.Search', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces onChange to fire 300ms after the last keystroke, not per keystroke', () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.Search value="" onChange={onChange} placeholder="Buscar..." />
      </FilterBar>,
    );

    const input = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abc');
  });
});

describe('FilterBar.Select', () => {
  it('renders a real <select> element for variant="native"', () => {
    const { container } = render(
      <FilterBar>
        <FilterBar.Select
          facet="status"
          label="Estado"
          variant="native"
          options={[
            { value: 'draft', label: 'Borrador' },
            { value: 'confirmed', label: 'Confirmado' },
          ]}
          value=""
          onChange={() => {}}
        />
      </FilterBar>,
    );

    expect(container.querySelector('select')).toBeInTheDocument();
  });

  it('replaces the prior selection rather than accumulating it (variant="radix")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.Select
          facet="status"
          label="Estado"
          options={[
            { value: 'draft', label: 'Borrador' },
            { value: 'confirmed', label: 'Confirmado' },
          ]}
          value="draft"
          onChange={onChange}
        />
      </FilterBar>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(screen.getByRole('option', { name: 'Confirmado' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('confirmed');
  });
});

describe('FilterBar.MultiSelect', () => {
  it('shows the facet label with no badge when 0 selected, and registers inactive', () => {
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={[]}
          onChange={() => {}}
        />
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.getByRole('button', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.queryByText(/seleccionados/)).not.toBeInTheDocument();
    expect(screen.getByText('0 filtros activos')).toBeInTheDocument();
  });

  it('shows the single option label when exactly 1 is selected', () => {
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={['key']}
          onChange={() => {}}
        />
      </FilterBar>,
    );

    expect(screen.getByText('Llaves')).toBeInTheDocument();
  });

  it('shows "N seleccionados" when more than one option is selected', () => {
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={['key', 'technical']}
          onChange={() => {}}
        />
      </FilterBar>,
    );

    expect(screen.getByText('2 seleccionados')).toBeInTheDocument();
  });

  it('renders a checkbox group with real checkbox semantics, not a listbox', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={[]}
          onChange={() => {}}
        />
      </FilterBar>,
    );

    await user.click(screen.getByRole('button', { name: 'Tipo' }));

    const group = screen.getByRole('group', { name: 'Tipo' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(group).not.toHaveAttribute('aria-multiselectable');
  });

  it('toggles aria-checked on click and calls onChange with the updated array (instant-apply, no Aplicar footer)', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();

    function Harness() {
      const [value, setValue] = useState<string[]>(['key']);
      return (
        <FilterBar>
          <FilterBar.MultiSelect
            facet="kind"
            label="Tipo"
            options={KIND_OPTIONS}
            value={value}
            onChange={(next) => {
              onChangeSpy(next);
              setValue(next);
            }}
          />
        </FilterBar>
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Tipo/ }));
    const checkbox = screen.getByRole('checkbox', { name: 'Técnico' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await user.click(checkbox);

    expect(onChangeSpy).toHaveBeenCalledWith(['key', 'technical']);
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: /Aplicar/i })).not.toBeInTheDocument();
  });

  it('closes the popover on Escape', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={[]}
          onChange={() => {}}
        />
      </FilterBar>,
    );

    await user.click(screen.getByRole('button', { name: 'Tipo' }));
    expect(screen.getByRole('group', { name: 'Tipo' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Tipo' })).not.toBeInTheDocument();
  });
});

describe('FilterBar.Cascade', () => {
  it('is a registration-only wrapper: renders children untouched and registers one chip per non-empty level', () => {
    render(
      <FilterBar>
        <FilterBar.Cascade
          value={{ administrationId: 'a1', buildingId: '', equipmentId: '' }}
          onChange={() => {}}
          labels={{ administration: 'Administración', building: 'Edificio', equipment: 'Equipo' }}
        >
          <div data-testid="cascade-stub">Cascade stub</div>
        </FilterBar.Cascade>
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.getByTestId('cascade-stub')).toBeInTheDocument();
    expect(screen.getByText('1 filtro activo')).toBeInTheDocument();
  });

  it('registers a chip per non-empty level when multiple levels are set', () => {
    render(
      <FilterBar>
        <FilterBar.Cascade
          value={{ administrationId: 'a1', buildingId: 'b1', equipmentId: '' }}
          onChange={() => {}}
          labels={{ administration: 'Administración', building: 'Edificio', equipment: 'Equipo' }}
        >
          <div>Cascade stub</div>
        </FilterBar.Cascade>
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.getByText('2 filtros activos')).toBeInTheDocument();
  });
});

describe('FilterBar.DateRange', () => {
  it('is active when either from or to is non-empty, and clearing resets both to empty', () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.DateRange value={{ from: '2026-01-01', to: '' }} onChange={onChange} />
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.getByText('1 filtro activo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quitar filtro/i }));
    expect(onChange).toHaveBeenCalledWith({ from: '', to: '' });
  });

  it('renders Desde/Hasta labeled date inputs', () => {
    render(
      <FilterBar>
        <FilterBar.DateRange value={{ from: '', to: '' }} onChange={() => {}} />
      </FilterBar>,
    );

    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
  });
});

describe('FilterBar.Summary — "Limpiar todo"', () => {
  it('invokes every registered clear callback and resets the active count to 0', () => {
    function Harness() {
      const [search, setSearch] = useState('llaves');
      const [statuses, setStatuses] = useState<string[]>(['draft']);
      return (
        <FilterBar>
          <FilterBar.Search value={search} onChange={setSearch} placeholder="Buscar..." />
          <FilterBar.MultiSelect
            facet="status"
            label="Estado"
            options={[{ value: 'draft', label: 'Borrador' }]}
            value={statuses}
            onChange={setStatuses}
          />
          <FilterBar.Summary />
        </FilterBar>
      );
    }

    render(<Harness />);

    expect(screen.getByText('2 filtros activos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }));
    expect(screen.getByText('0 filtros activos')).toBeInTheDocument();
  });
});
