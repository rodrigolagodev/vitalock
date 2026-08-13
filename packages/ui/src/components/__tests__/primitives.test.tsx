import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Import the shared primitives through the package entry point — this is the
// public contract consumers (admin + installer) will rely on.
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Switch,
  Textarea,
} from '@vitalock/ui';

describe('shared primitives from @vitalock/ui', () => {
  it('renders a Button with role button and its label', () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeInTheDocument();
  });

  it('renders a second Button variant with different content', () => {
    render(<Button variant="destructive">Eliminar</Button>);
    const button = screen.getByRole('button', { name: 'Eliminar' });
    expect(button).toBeInTheDocument();
  });

  it('renders a Switch with role switch that toggles on click', () => {
    render(<Switch />);
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('renders a Checkbox with role checkbox that toggles on click', () => {
    render(<Checkbox />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('renders the dialog title when the dialog is open', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Confirmar acción</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Confirmar acción');
  });

  it('does not render the dialog when it is closed', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Confirmar acción</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an Input with its placeholder and typed value', () => {
    render(<Input placeholder="Buscar por nombre" defaultValue="Vitalock" />);
    const input = screen.getByPlaceholderText('Buscar por nombre');
    expect(input).toHaveValue('Vitalock');
  });

  it('renders a Textarea with its placeholder and content', () => {
    render(<Textarea placeholder="Detalle del trabajo" defaultValue="Revisar llaves" />);
    const textarea = screen.getByPlaceholderText('Detalle del trabajo');
    expect(textarea).toHaveValue('Revisar llaves');
  });

  it('renders a Badge with its label', () => {
    render(<Badge>Activo</Badge>);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('renders a Badge variant with its label', () => {
    render(<Badge variant="destructive">Error</Badge>);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });
});
