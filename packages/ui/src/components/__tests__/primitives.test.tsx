import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Import the shared primitives through the package entry point — this is the
// public contract consumers (admin + installer) will rely on.
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
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

describe('Card primitives from @vitalock/ui', () => {
  it('renders Card content and merges a custom className', () => {
    render(<Card className="custom-card">Contenido</Card>);
    const card = screen.getByText('Contenido');
    expect(card).toHaveClass('custom-card');
    expect(card).toHaveClass('rounded-xl');
  });

  it('forwards a ref to the underlying div on Card', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>Contenido</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('adds interactive hover/focus-visible classes when variant="interactive"', () => {
    render(
      <Card variant="interactive" data-testid="card">
        Contenido
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('hover:bg-muted/50');
    expect(card).toHaveClass('focus-visible:ring-2');
  });

  it('does not add interactive classes for the default variant', () => {
    render(<Card data-testid="card">Contenido</Card>);
    const card = screen.getByTestId('card');
    expect(card).not.toHaveClass('hover:bg-accent/50');
  });

  it('renders CardHeader, CardTitle, CardAction, CardContent and CardFooter, each forwarding refs and merging className', () => {
    const headerRef = createRef<HTMLDivElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const actionRef = createRef<HTMLDivElement>();
    const contentRef = createRef<HTMLDivElement>();
    const footerRef = createRef<HTMLDivElement>();

    render(
      <Card>
        <CardHeader ref={headerRef} className="custom-header">
          <CardTitle ref={titleRef} className="custom-title">
            Título
          </CardTitle>
          <CardAction ref={actionRef} className="custom-action">
            Acción
          </CardAction>
        </CardHeader>
        <CardContent ref={contentRef} className="custom-content">
          Contenido
        </CardContent>
        <CardFooter ref={footerRef} className="custom-footer">
          Pie
        </CardFooter>
      </Card>,
    );

    expect(screen.getByText('Título')).toBeInTheDocument();
    expect(screen.getByText('Acción')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByText('Pie')).toBeInTheDocument();

    expect(headerRef.current).toBeInstanceOf(HTMLDivElement);
    expect(headerRef.current).toHaveClass('custom-header');
    expect(titleRef.current).toHaveClass('custom-title');
    expect(actionRef.current).toHaveClass('custom-action');
    expect(contentRef.current).toHaveClass('custom-content');
    expect(footerRef.current).toHaveClass('custom-footer');
  });
});
