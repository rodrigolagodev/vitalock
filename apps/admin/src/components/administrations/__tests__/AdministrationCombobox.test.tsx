import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdministrationCombobox } from '../AdministrationCombobox';
import type { AdministrationRow } from '@/hooks/useAdministrations';

const administrations: AdministrationRow[] = [
  {
    id: 'adm-1',
    company_name: 'Admin García S.A.',
    tax_id: '30-71234567-8',
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
  },
  {
    id: 'adm-2',
    company_name: 'Consorcio Avellaneda',
    tax_id: '30-50987654-1',
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
  },
  {
    id: 'adm-3',
    company_name: 'Torres del Parque',
    tax_id: null,
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
  },
];

function setup(props: Partial<React.ComponentProps<typeof AdministrationCombobox>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <AdministrationCombobox
      administrations={administrations}
      value={null}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, ...utils };
}

async function openDropdown() {
  const input = screen.getByRole('combobox', { name: /buscar administración/i });
  await userEvent.click(input);
  return input;
}

describe('AdministrationCombobox', () => {
  it('shows the full list when opened and no search is active', async () => {
    setup();
    await openDropdown();

    expect(screen.getByRole('option', { name: /admin garcía/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /consorcio avellaneda/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /torres del parque/i })).toBeInTheDocument();
  });

  it('filters client-side by company name while typing', async () => {
    setup();
    const input = await openDropdown();

    await userEvent.type(input, 'parque');

    expect(screen.queryByRole('option', { name: /admin garcía/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /consorcio avellaneda/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /torres del parque/i })).toBeInTheDocument();
  });

  it('filters by CUIT/CUIL as well', async () => {
    setup();
    const input = await openDropdown();

    await userEvent.type(input, '71234567');

    expect(screen.getByRole('option', { name: /admin garcía/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /consorcio avellaneda/i })).not.toBeInTheDocument();
  });

  it('emits the selected administration id and closes the dropdown', async () => {
    const { onChange, rerender } = setup();
    const input = await openDropdown();

    await userEvent.click(screen.getByRole('option', { name: /consorcio avellaneda/i }));

    expect(onChange).toHaveBeenCalledWith('adm-2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('');

    // Controlled flow: the parent re-renders with the new value (as the form does).
    rerender(
      <AdministrationCombobox
        administrations={administrations}
        value="adm-2"
        onChange={onChange}
      />,
    );
    expect(input).toHaveValue('Consorcio Avellaneda — 30-50987654-1');
  });

  it('shows the selected display value with CUIT when present', async () => {
    setup({ value: 'adm-2' });

    expect(screen.getByRole('combobox', { name: /buscar administración/i })).toHaveValue(
      'Consorcio Avellaneda — 30-50987654-1',
    );
  });

  it('shows just the company name when the administration has no CUIT', async () => {
    setup({ value: 'adm-3' });

    expect(screen.getByRole('combobox', { name: /buscar administración/i })).toHaveValue(
      'Torres del Parque',
    );
  });

  it('clears the selection and emits null', async () => {
    const { onChange } = setup({ value: 'adm-1' });

    await userEvent.click(screen.getByRole('button', { name: /quitar administración/i }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a no-results message when the filter matches nothing', async () => {
    setup();
    const input = await openDropdown();

    await userEvent.type(input, 'zzzz');

    expect(screen.getByText('No se encontraron administraciones')).toBeInTheDocument();
  });
});