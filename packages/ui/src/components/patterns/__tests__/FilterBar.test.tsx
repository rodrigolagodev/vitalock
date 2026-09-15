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

describe('FilterBar registry & Summary — "Limpiar todo" visibility', () => {
  it('shows exactly one "Limpiar todo" control for a multi-select facet with several selected values', () => {
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

    expect(screen.getAllByRole('button', { name: 'Limpiar todo' })).toHaveLength(1);
  });

  it('hides the "Limpiar todo" control once the only active facet unmounts', () => {
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
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument();

    rerender(<Wrapper showSearch={false} />);
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).not.toBeInTheDocument();
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
  it('shows the facet label on a dashed trigger with no badge when 0 selected, and registers inactive', () => {
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

    const trigger = screen.getByRole('button', { name: 'Tipo' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('border-dashed');
    expect(screen.queryByText(/seleccionados/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).not.toBeInTheDocument();
  });

  it('shows the single option label as an inline badge when exactly 1 is selected', () => {
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

  it('shows each selected option as its own badge when exactly 2 are selected, without collapsing', () => {
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

    expect(screen.getByText('Llaves')).toBeInTheDocument();
    expect(screen.getByText('Técnico')).toBeInTheDocument();
    expect(screen.queryByText(/seleccionados/)).not.toBeInTheDocument();
  });

  it('collapses to "N seleccionados" once more than 2 options are selected', () => {
    const options = [
      { value: 'key', label: 'Llaves' },
      { value: 'technical', label: 'Técnico' },
      { value: 'billing', label: 'Facturación' },
    ];
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={options}
          value={['key', 'technical', 'billing']}
          onChange={() => {}}
        />
      </FilterBar>,
    );

    expect(screen.getByText('3 seleccionados')).toBeInTheDocument();
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument();
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

  it('clears just this facet via "Limpiar filtro" inside the popover', async () => {
    const user = userEvent.setup();
    const onChangeKind = vi.fn();
    render(
      <FilterBar>
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={['key']}
          onChange={onChangeKind}
        />
      </FilterBar>,
    );

    await user.click(screen.getByRole('button', { name: /Tipo/ }));
    await user.click(screen.getByRole('button', { name: 'Limpiar filtro' }));

    expect(onChangeKind).toHaveBeenCalledWith([]);
  });

  it('does not render "Limpiar filtro" when no option is selected', async () => {
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
    expect(screen.queryByRole('button', { name: 'Limpiar filtro' })).not.toBeInTheDocument();
  });
});

describe('FilterBar.Cascade', () => {
  it('is a registration-only wrapper: renders children untouched and shows "Limpiar todo" once a level is set', () => {
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
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument();
  });

  it('clicking "Limpiar todo" clears every registered cascade level via onChange', () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.Cascade
          value={{ administrationId: 'a1', buildingId: 'b1', equipmentId: '' }}
          onChange={onChange}
          labels={{ administration: 'Administración', building: 'Edificio', equipment: 'Equipo' }}
        >
          <div>Cascade stub</div>
        </FilterBar.Cascade>
        <FilterBar.Summary />
      </FilterBar>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }));

    expect(onChange).toHaveBeenCalledWith({
      administrationId: '',
      buildingId: '',
      equipmentId: '',
    });
  });
});

describe('FilterBar.DateRange', () => {
  it('is active when either from or to is non-empty, and "Limpiar todo" resets both to empty', () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.DateRange value={{ from: '2026-01-01', to: '' }} onChange={onChange} />
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }));
    expect(onChange).toHaveBeenCalledWith({ from: '', to: '' });
  });

  // Two always-visible native date inputs (each with its own "Desde"/
  // "Hasta" label above it) measured ~450-500px wide in practice — by far
  // the widest control in the bar — so it was almost always the item that
  // got pushed onto its own line once a couple of other filters were also
  // active, and its own label+input stacking made that line taller than
  // its neighbors besides. Collapsing it into the same dashed-border
  // popover-trigger family as MultiSelect gives every filter the same
  // compact, near-fixed footprint, which is what actually keeps the row
  // from wrapping the trailing Summary button onto an orphan line.
  it('renders as a compact trigger button, not always-visible inputs', () => {
    render(
      <FilterBar>
        <FilterBar.DateRange value={{ from: '', to: '' }} onChange={() => {}} />
      </FilterBar>,
    );

    expect(screen.getByRole('button', { name: /fecha/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hasta')).not.toBeInTheDocument();
  });

  it('reveals Desde/Hasta labeled date inputs once the trigger opens', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar>
        <FilterBar.DateRange value={{ from: '', to: '' }} onChange={() => {}} />
      </FilterBar>,
    );

    await user.click(screen.getByRole('button', { name: /fecha/i }));

    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
  });

  it('shows the active range as a badge on the trigger itself', () => {
    render(
      <FilterBar>
        <FilterBar.DateRange value={{ from: '2026-08-01', to: '' }} onChange={() => {}} />
      </FilterBar>,
    );

    const trigger = screen.getByRole('button', { name: /fecha/i });
    expect(within(trigger).getByText(/2026-08-01/)).toBeInTheDocument();
  });
});

describe('FilterBar.Summary — "Limpiar todo"', () => {
  it('renders nothing when no filters are active', () => {
    const { container } = render(
      <FilterBar>
        <FilterBar.Search value="" onChange={() => {}} placeholder="Buscar..." />
        <FilterBar.Summary />
      </FilterBar>,
    );

    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).not.toBeInTheDocument();
    // Only the Search control's own markup should be present — Summary
    // contributes no empty wrapper/container to the DOM.
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('invokes every registered clear callback and hides itself again once no facet remains active', () => {
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

    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }));
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).not.toBeInTheDocument();
  });
});
