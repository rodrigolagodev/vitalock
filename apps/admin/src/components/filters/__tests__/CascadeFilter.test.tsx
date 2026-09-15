import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock data for select options
const MOCK_ADMINS = [
  { id: 'adm-1', label: 'Garcia S.A.' },
  { id: 'adm-2', label: 'Torres Corp.' },
];
const MOCK_BUILDINGS = [
  { id: 'bld-1', label: 'Torre Norte', parentId: 'adm-1' },
  { id: 'bld-2', label: 'Torre Sur', parentId: 'adm-2' },
  { id: 'bld-3', label: 'Torre Este', parentId: 'adm-1' },
];
const MOCK_EQUIPMENT = [{ id: 'eq-1', label: 'SN-001', parentId: 'bld-1' }];

import { CascadeFilter } from '../CascadeFilter';

function renderFilter(props: Partial<React.ComponentProps<typeof CascadeFilter>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  return {
    onChange,
    ...render(
      <CascadeFilter
        value={{}}
        onChange={onChange}
        levels={['administration', 'building', 'equipment']}
        administrations={MOCK_ADMINS}
        buildings={MOCK_BUILDINGS}
        equipment={MOCK_EQUIPMENT}
        {...props}
      />,
    ),
  };
}

/** Opens a Radix Select trigger and clicks the option matching optionName. */
async function selectRadixOption(triggerName: RegExp, optionName: RegExp): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: triggerName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('CascadeFilter rendering', () => {
  it('renders the administration select', () => {
    renderFilter();
    expect(screen.getByRole('combobox', { name: /administración/i })).toBeInTheDocument();
  });

  it('renders building select disabled when no administration selected', () => {
    renderFilter();
    expect(screen.getByRole('combobox', { name: /edificio/i })).toBeDisabled();
  });

  it('renders equipment select disabled when no building selected', () => {
    renderFilter();
    expect(screen.getByRole('combobox', { name: /equipo/i })).toBeDisabled();
  });

  it('building select is enabled when administrationId is set', () => {
    renderFilter({ value: { administrationId: 'adm-1' } });
    expect(screen.getByRole('combobox', { name: /edificio/i })).not.toBeDisabled();
  });

  it('equipment select is enabled when both administrationId and buildingId are set', () => {
    renderFilter({ value: { administrationId: 'adm-1', buildingId: 'bld-1' } });
    expect(screen.getByRole('combobox', { name: /equipo/i })).not.toBeDisabled();
  });

  it('shows a disabled-reason hint on the building level when no administration is selected', () => {
    renderFilter();
    const buildingTrigger = screen.getByRole('combobox', { name: /edificio/i });
    expect(buildingTrigger).toHaveAttribute('aria-describedby', 'cascade-building-hint');
    const hint = screen.getByText(/seleccioná una administración primero/i);
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveAttribute('id', 'cascade-building-hint');
  });

  it('hides the disabled-reason hint on the building level once an administration is selected', () => {
    renderFilter({ value: { administrationId: 'adm-1' } });
    expect(screen.queryByText(/seleccioná una administración primero/i)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /edificio/i })).not.toHaveAttribute(
      'aria-describedby',
    );
  });
});

describe('CascadeFilter compact trigger style', () => {
  // Each level used to be a stacked <Label> + full-width Select — the same
  // "visible label eats vertical space its neighbors don't have" shape
  // FilterBar.DateRange had before its own popover-trigger fix, and wide
  // enough on its own to burn a lot of row space. Now matches
  // FilterBar.Select/MultiSelect's dashed-border, badge-in-trigger language.
  it('renders each level as a dashed-border trigger with no stacked label above it', () => {
    renderFilter();
    const adminTrigger = screen.getByRole('combobox', { name: /administración/i });
    expect(adminTrigger).toHaveClass('border-dashed');
    expect(screen.queryByText('Administración', { selector: 'label' })).not.toBeInTheDocument();
  });

  it('shows the selected option as an inline badge on the trigger once picked', () => {
    renderFilter({ value: { administrationId: 'adm-1' } });
    const adminTrigger = screen.getByRole('combobox', { name: /administración/i });
    expect(within(adminTrigger).getByText('Garcia S.A.')).toBeInTheDocument();
  });

  it('shows no badge when nothing is selected', () => {
    renderFilter();
    const adminTrigger = screen.getByRole('combobox', { name: /administración/i });
    expect(within(adminTrigger).queryByText(/garcia|torres/i)).not.toBeInTheDocument();
  });
});

describe('CascadeFilter grouping (administration/building/equipment read as one connected control)', () => {
  // The three levels are hierarchically coupled (picking one filters the
  // next) — unlike a page's other, genuinely independent filters (Estado,
  // Tipo), so they should visually read as one unit rather than 3 separate-
  // looking dashed chips. Joined via shared borders (squared-off shared
  // edges, -ml-px overlap) rather than a wrapping box, matching the
  // shadcn-derived "no boxed container" convention the rest of FilterBar
  // already committed to.
  it('squares off the shared edge between adjacent levels and overlaps their borders', () => {
    renderFilter();
    const admin = screen.getByRole('combobox', { name: /administración/i });
    const building = screen.getByRole('combobox', { name: /edificio/i });
    const equipment = screen.getByRole('combobox', { name: /equipo/i });

    expect(admin).toHaveClass('rounded-r-none');
    expect(admin).not.toHaveClass('-ml-px');

    expect(building).toHaveClass('rounded-none', '-ml-px');

    expect(equipment).toHaveClass('rounded-l-none', '-ml-px');
  });

  it('keeps the sole level unrounded-off when only one level is rendered', () => {
    render(
      <CascadeFilter
        value={{}}
        onChange={vi.fn()}
        levels={['administration']}
        administrations={MOCK_ADMINS}
        buildings={MOCK_BUILDINGS}
        equipment={MOCK_EQUIPMENT}
      />,
    );
    const admin = screen.getByRole('combobox', { name: /administración/i });
    expect(admin).not.toHaveClass('rounded-r-none', 'rounded-l-none', 'rounded-none', '-ml-px');
  });

  it('treats the first rendered level as the group edge when levels=["building","equipment"]', () => {
    render(
      <CascadeFilter
        value={{}}
        onChange={vi.fn()}
        levels={['building', 'equipment']}
        administrations={MOCK_ADMINS}
        buildings={MOCK_BUILDINGS}
        equipment={MOCK_EQUIPMENT}
      />,
    );
    const building = screen.getByRole('combobox', { name: /edificio/i });
    const equipment = screen.getByRole('combobox', { name: /equipo/i });
    expect(building).toHaveClass('rounded-r-none');
    expect(equipment).toHaveClass('rounded-l-none', '-ml-px');
  });
});

describe('CascadeFilter interactions', () => {
  it('calls onChange with administrationId when admin is selected', async () => {
    const { onChange } = renderFilter();
    await selectRadixOption(/administración/i, /^garcia s\.a\.$/i);
    expect(onChange).toHaveBeenCalledWith({ administrationId: 'adm-1' });
  });

  it('selecting admin resets buildingId and equipmentId', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1', equipmentId: 'eq-1' },
    });
    await selectRadixOption(/administración/i, /^torres corp\.$/i);
    expect(onChange).toHaveBeenCalledWith({ administrationId: 'adm-2' });
  });

  it('calls onChange with buildingId preserving administrationId when building selected', async () => {
    const { onChange } = renderFilter({ value: { administrationId: 'adm-1' } });
    await selectRadixOption(/edificio/i, /^torre norte$/i);
    expect(onChange).toHaveBeenCalledWith({
      administrationId: 'adm-1',
      buildingId: 'bld-1',
    });
  });

  it('selecting a different building resets equipmentId', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1', equipmentId: 'eq-1' },
    });
    await selectRadixOption(/edificio/i, /^torre este$/i);
    expect(onChange).toHaveBeenCalledWith({
      administrationId: 'adm-1',
      buildingId: 'bld-3',
    });
  });

  it('calls onChange with equipmentId when equipment selected', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1' },
    });
    await selectRadixOption(/equipo/i, /^sn-001$/i);
    expect(onChange).toHaveBeenCalledWith({
      administrationId: 'adm-1',
      buildingId: 'bld-1',
      equipmentId: 'eq-1',
    });
  });

  it('clearing administration resets all three fields', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1', equipmentId: 'eq-1' },
    });
    await selectRadixOption(/administración/i, /^todas$/i);
    expect(onChange).toHaveBeenCalledWith({});
  });
});

describe('CascadeFilter levels prop', () => {
  it('renders only administration when levels=["administration"]', () => {
    render(
      <CascadeFilter
        value={{}}
        onChange={vi.fn()}
        levels={['administration']}
        administrations={MOCK_ADMINS}
        buildings={MOCK_BUILDINGS}
        equipment={MOCK_EQUIPMENT}
      />,
    );
    expect(screen.getByRole('combobox', { name: /administración/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /edificio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /equipo/i })).not.toBeInTheDocument();
  });
});
