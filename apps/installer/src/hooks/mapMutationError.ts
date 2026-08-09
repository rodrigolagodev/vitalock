import { toast } from 'sonner';

interface PostgrestError {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string'
  );
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as Record<string, unknown>).message === 'string'
  ) {
    const msg = (err as { message: string }).message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch') ||
      msg.includes('failed to fetch')
    );
  }
  return false;
}

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
