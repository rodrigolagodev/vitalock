import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

// Import through the package entry point — the public contract consumers
// (admin + installer) will rely on.
import { SectionHeading } from '@vitalock/ui';

describe('SectionHeading', () => {
  it('renders the title as an h2 heading', () => {
    render(<SectionHeading title="Tipo de orden" />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tipo de orden' }),
    ).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <SectionHeading
        title="Ítems"
        description="Cada ítem es un pack de llaves con un mismo autorizado a retirar."
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Ítems' })).toBeInTheDocument();
    expect(
      screen.getByText('Cada ítem es un pack de llaves con un mismo autorizado a retirar.'),
    ).toBeInTheDocument();
  });

  it('does not render a description when omitted', () => {
    render(<SectionHeading title="Cliente" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Cliente' })).toBeInTheDocument();
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('renders the action slot children', () => {
    render(
      <SectionHeading title="Notas">
        <button type="button">Acción</button>
      </SectionHeading>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Notas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument();
  });

  it('renders a different title with a different description', () => {
    render(
      <SectionHeading
        title="Equipo"
        description="Cada ítem genera una tarea del área técnica."
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Equipo' })).toBeInTheDocument();
    expect(
      screen.getByText('Cada ítem genera una tarea del área técnica.'),
    ).toBeInTheDocument();
  });
});
