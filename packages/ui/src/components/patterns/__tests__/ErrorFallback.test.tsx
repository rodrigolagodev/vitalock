import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ErrorFallback } from '../ErrorFallback';

describe('ErrorFallback', () => {
  it('shows the default message and a retry action', async () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ErrorFallback onRetry={onRetry} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Algo salió mal al mostrar esta pantalla.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the home action only when provided', async () => {
    const onGoHome = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <ErrorFallback onRetry={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Ir al inicio' })).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ErrorFallback onRetry={() => {}} onGoHome={onGoHome} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ir al inicio' }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom message', () => {
    render(
      <MemoryRouter>
        <ErrorFallback message="Falló la carga de la orden." onRetry={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Falló la carga de la orden.')).toBeInTheDocument();
  });
});
