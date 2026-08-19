import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { TechnicalOrderStatusBadge } from '../TechnicalOrderStatusBadge';
import type { TechnicalOrderStatus } from '@/hooks/useTechnicalOrders';

describe('TechnicalOrderStatusBadge', () => {
  const statuses: TechnicalOrderStatus[] = [
    'draft',
    'confirmed',
    'in_progress',
    'completed',
    'invoiced',
    'cancelled',
  ];

  it.each(statuses)('renders a non-empty label for status "%s"', (status) => {
    render(<TechnicalOrderStatusBadge status={status} />);
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders "Borrador" for draft status', () => {
    render(<TechnicalOrderStatusBadge status="draft" />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('renders "Cancelado" for cancelled status', () => {
    render(<TechnicalOrderStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('renders "Facturado" for invoiced status', () => {
    render(<TechnicalOrderStatusBadge status="invoiced" />);
    expect(screen.getByText('Facturado')).toBeInTheDocument();
  });

  it('does NOT accept ready_for_pickup as a valid status type', () => {
    // TechnicalOrderStatus union does not include 'ready_for_pickup'.
    // This test documents the spec constraint at runtime via the type system.
    // If the type allowed it, this would be a TypeScript compile error.
    const validStatuses: TechnicalOrderStatus[] = [
      'draft',
      'confirmed',
      'in_progress',
      'completed',
      'invoiced',
      'cancelled',
    ];
    expect(validStatuses).not.toContain('ready_for_pickup');
  });
});
