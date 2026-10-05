import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { KeyOrderItemRow } from '@/hooks/useKeyOrder';

const { useDetailsMock } = vi.hoisted(() => ({ useDetailsMock: vi.fn() }));

vi.mock('@/hooks/useOrderKeyDetails', () => ({ useOrderKeyDetails: useDetailsMock }));

import { KeyItemDetailsDialog } from '../KeyItemDetailsDialog';

const item = { id: 'i-1', produced_key_id: 'k-1', pickup_particulares: null } as KeyOrderItemRow;

describe('KeyItemDetailsDialog states', () => {
  beforeEach(() => useDetailsMock.mockReset());

  it('shows a labelled 4-row skeleton and no spinner while loading', () => {
    useDetailsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<KeyItemDetailsDialog open onOpenChange={vi.fn()} item={item} />);

    const status = screen.getByRole('status', { name: 'Cargando detalle' });
    expect(status.querySelectorAll('.animate-pulse')).toHaveLength(8);
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('shows a compact not-found message when the key does not exist', () => {
    useDetailsMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    render(<KeyItemDetailsDialog open onOpenChange={vi.fn()} item={item} />);

    expect(screen.getByText('No se encontró la llave.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the error message when loading fails', () => {
    useDetailsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<KeyItemDetailsDialog open onOpenChange={vi.fn()} item={item} />);

    expect(screen.getByText('No se pudieron cargar los detalles de la llave.')).toBeInTheDocument();
    expect(screen.queryByText('No se encontró la llave.')).not.toBeInTheDocument();
  });
});
