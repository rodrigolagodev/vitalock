import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ErrorState } from '@vitalock/ui';

describe('ErrorState', () => {
  it('renders no button when onRetry is not provided', () => {
    render(<ErrorState message="No se pudo cargar." />);
    expect(screen.getByText('No se pudo cargar.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('fires onRetry from a "Reintentar" button by default', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="No se pudo cargar." onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('honours a custom retryLabel and renders children after the retry button', () => {
    render(
      <ErrorState message="Falló." onRetry={() => {}} retryLabel="Volver a intentar">
        <button type="button">Ir al inicio</button>
      </ErrorState>,
    );
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Volver a intentar', 'Ir al inicio']);
  });

  it('keeps rendering children and the back link unchanged without onRetry', () => {
    render(
      <MemoryRouter>
        <ErrorState message="Falló." back={{ label: 'Volver', to: '/inicio' }}>
          <button type="button">Acción</button>
        </ErrorState>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/inicio');
  });
});
