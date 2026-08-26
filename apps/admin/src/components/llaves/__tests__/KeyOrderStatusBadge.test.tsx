import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { KeyOrderStatusBadge } from '../KeyOrderStatusBadge';
import type { KeyOrderStatus } from '@/hooks/useKeyOrders';

describe('KeyOrderStatusBadge', () => {
  const statuses: KeyOrderStatus[] = [
    'draft',
    'confirmed',
    'in_progress',
    'pending_installation',
    'ready_for_pickup',
    'completed',
    'invoiced',
    'cancelled',
  ];

  it.each(statuses)('renders a non-empty label for status "%s"', (status) => {
    render(<KeyOrderStatusBadge status={status} />);
    // At least one non-empty text node must appear.
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders "Borrador" for draft status', () => {
    render(<KeyOrderStatusBadge status="draft" />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('renders "Listo para retirar" for ready_for_pickup status', () => {
    render(<KeyOrderStatusBadge status="ready_for_pickup" />);
    expect(screen.getByText('Listo para retirar')).toBeInTheDocument();
  });

  it('renders "Pendiente instalación" for pending_installation status', () => {
    render(<KeyOrderStatusBadge status="pending_installation" />);
    expect(screen.getByText('Pendiente instalación')).toBeInTheDocument();
  });

  it('renders "Cancelado" for cancelled status', () => {
    render(<KeyOrderStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });
});
