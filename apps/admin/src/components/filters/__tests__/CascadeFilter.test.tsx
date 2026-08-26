import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
];
const MOCK_EQUIPMENT = [
  { id: 'eq-1', label: 'SN-001', parentId: 'bld-1' },
];

import { CascadeFilter } from '../CascadeFilter';

function renderFilter(
  props: Partial<React.ComponentProps<typeof CascadeFilter>> = {},
) {
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

describe('CascadeFilter rendering', () => {
  it('renders the administration select', () => {
    renderFilter();
    expect(screen.getByLabelText(/administración/i)).toBeInTheDocument();
  });

  it('renders building select disabled when no administration selected', () => {
    renderFilter();
    expect(screen.getByLabelText(/edificio/i)).toBeDisabled();
  });

  it('renders equipment select disabled when no building selected', () => {
    renderFilter();
    expect(screen.getByLabelText(/equipo/i)).toBeDisabled();
  });

  it('building select is enabled when administrationId is set', () => {
    renderFilter({ value: { administrationId: 'adm-1' } });
    expect(screen.getByLabelText(/edificio/i)).not.toBeDisabled();
  });

  it('equipment select is enabled when both administrationId and buildingId are set', () => {
    renderFilter({ value: { administrationId: 'adm-1', buildingId: 'bld-1' } });
    expect(screen.getByLabelText(/equipo/i)).not.toBeDisabled();
  });
});

describe('CascadeFilter interactions', () => {
  it('calls onChange with administrationId when admin is selected', async () => {
    const { onChange } = renderFilter();
    const select = screen.getByLabelText(/administración/i);
    await userEvent.selectOptions(select, 'adm-1');
    expect(onChange).toHaveBeenCalledWith({ administrationId: 'adm-1' });
  });

  it('selecting admin resets buildingId and equipmentId', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1', equipmentId: 'eq-1' },
    });
    const select = screen.getByLabelText(/administración/i);
    await userEvent.selectOptions(select, 'adm-2');
    expect(onChange).toHaveBeenCalledWith({ administrationId: 'adm-2' });
  });

  it('calls onChange with buildingId preserving administrationId when building selected', async () => {
    const { onChange } = renderFilter({ value: { administrationId: 'adm-1' } });
    const select = screen.getByLabelText(/edificio/i);
    await userEvent.selectOptions(select, 'bld-1');
    expect(onChange).toHaveBeenCalledWith({
      administrationId: 'adm-1',
      buildingId: 'bld-1',
    });
  });

  it('selecting building resets equipmentId', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1', equipmentId: 'eq-1' },
    });
    const select = screen.getByLabelText(/edificio/i);
    await userEvent.selectOptions(select, 'bld-1');
    expect(onChange).toHaveBeenCalledWith({
      administrationId: 'adm-1',
      buildingId: 'bld-1',
    });
  });

  it('calls onChange with equipmentId when equipment selected', async () => {
    const { onChange } = renderFilter({
      value: { administrationId: 'adm-1', buildingId: 'bld-1' },
    });
    const select = screen.getByLabelText(/equipo/i);
    await userEvent.selectOptions(select, 'eq-1');
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
    const select = screen.getByLabelText(/administración/i);
    await userEvent.selectOptions(select, '');
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
    expect(screen.getByLabelText(/administración/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/edificio/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/equipo/i)).not.toBeInTheDocument();
  });
});
