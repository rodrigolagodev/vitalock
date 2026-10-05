import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { ProductFormFields } from '../ProductFormFields';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

interface Values {
  name: string;
  category: string;
  cost_price: number | null;
}

function Harness({ errors }: { errors: Record<string, { message: string }> }) {
  const { control } = useForm<Values>({
    defaultValues: { name: '', category: '', cost_price: null },
  });
  return (
    <ProductFormFields<Values>
      control={control}
      name="name"
      categoryName="category"
      costPriceName="cost_price"
      errors={errors as never}
    />
  );
}

describe('ProductFormFields', () => {
  it('wires each field error to its control through FormField', () => {
    render(
      <Harness
        errors={{
          name: { message: 'El nombre es obligatorio' },
          category: { message: 'Elegí una categoría' },
          cost_price: { message: 'Precio inválido' },
        }}
      />,
    );

    expectInvalidFieldWired();
    expect(screen.getByLabelText('Nombre *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Precio de costo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByRole('radiogroup', { name: 'Categoría' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('renders clean controls when there are no errors', () => {
    render(<Harness errors={{}} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre *')).not.toHaveAttribute('aria-invalid');
  });
});
