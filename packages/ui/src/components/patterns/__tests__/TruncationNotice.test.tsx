import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TruncationNotice } from '@vitalock/ui';

describe('TruncationNotice', () => {
  it('renders nothing when the list is not truncated', () => {
    const { container } = render(<TruncationNotice truncated={false} shown={10} total={10} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells how many rows are shown out of the total when truncated', () => {
    render(<TruncationNotice truncated shown={1000} total={1500} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'Mostrando los primeros 1.000 de 1.500 resultados. Refiná los filtros para ver el resto.',
    );
  });

  it('accepts a custom hint for lists filtered client-side', () => {
    render(
      <TruncationNotice
        truncated
        shown={1000}
        total={1200}
        hint="Se muestran las más recientes."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mostrando los primeros 1.000 de 1.200 resultados. Se muestran las más recientes.',
    );
  });

  it('omits the total when it is unknown', () => {
    render(<TruncationNotice truncated shown={1000} total={undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mostrando los primeros 1.000 resultados. Refiná los filtros para ver el resto.',
    );
  });
});
