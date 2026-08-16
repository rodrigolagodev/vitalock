import { toast } from 'sonner';
import { isNetworkError, isPostgrestError } from '@vitalock/shared';

/**
 * Maps a mutation error to the correct Spanish Sonner toast.
 * SQLSTATE mapping per FLOWS.md §13 / Worklist R4 / Tickets R4:
 *   23514 → status already changed or validation failure
 *   42501 → RLS denial / reassignment race
 *   network/timeout → connection error
 *   generic → error with SQLSTATE code
 */
export function toastMutationError(err: unknown): void {
  if (isNetworkError(err)) {
    toast.error('Error de conexión. Intentá de nuevo.');
    return;
  }

  if (isPostgrestError(err)) {
    switch (err.code) {
      case '23514':
        toast.error('El estado ya fue actualizado. Actualizá la lista.');
        return;
      case '42501':
        toast.error(
          'No tenés permiso. Es posible que el ticket haya sido reasignado.',
        );
        return;
      default:
        toast.error(`Ocurrió un error. Código: ${err.code}`);
        return;
    }
  }

  // Generic unhandled
  toast.error('Ocurrió un error. Intentá de nuevo.');
}
