import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { toastMutationError } from '../mapMutationError';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('toastMutationError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('23514 → status already changed message', () => {
    toastMutationError({ code: '23514', message: 'check violation' });
    expect(toast.error).toHaveBeenCalledWith(
      'El estado ya fue actualizado. Actualizá la lista.',
    );
  });

  it('42501 → RLS denial / reassignment message', () => {
    toastMutationError({ code: '42501', message: 'permission denied' });
    expect(toast.error).toHaveBeenCalledWith(
      'No tenés permiso. Es posible que el ticket haya sido reasignado.',
    );
  });

  it('TypeError (network) → connection error message', () => {
    toastMutationError(new TypeError('Failed to fetch'));
    expect(toast.error).toHaveBeenCalledWith('Error de conexión. Intentá de nuevo.');
  });

  it('network error via message string → connection error message', () => {
    toastMutationError({ message: 'Network timeout occurred', code: 'TIMEOUT' });
    expect(toast.error).toHaveBeenCalledWith('Error de conexión. Intentá de nuevo.');
  });

  it('unknown SQLSTATE → generic error with code', () => {
    toastMutationError({ code: '99999', message: 'some db error' });
    expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Código: 99999');
  });

  it('generic non-postgrest error → generic retry message', () => {
    toastMutationError(new Error('Something exploded'));
    expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Intentá de nuevo.');
  });
});
