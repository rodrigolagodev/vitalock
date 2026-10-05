import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildingCombobox } from '../BuildingCombobox';
import type { BuildingRow } from '@/hooks/useBuildings';

const buildings: BuildingRow[] = [
  {
    id: 'b-1',
    name: 'Edificio Sur',
    address: 'Calle 1',
    status: 'active',
    administration_id: 'adm-1',
    key_count: 0,
    equipment_count: 0,
  },
];

function setup(props: Partial<React.ComponentProps<typeof BuildingCombobox>> = {}) {
  return render(
    <BuildingCombobox buildings={buildings} value={null} onChange={vi.fn()} {...props} />,
  );
}

describe('BuildingCombobox', () => {
  it('forwards id, aria-invalid and aria-describedby to the input (FormField pass-through)', () => {
    setup({ id: 'building_id', 'aria-invalid': true, 'aria-describedby': 'err-1' });
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('id', 'building_id');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'err-1');
  });

  it('leaves aria-invalid and aria-describedby off when not given', () => {
    setup({ id: 'building_id' });
    const input = screen.getByRole('combobox');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});
