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
 * Admin SQLSTATE mapping per design.md error-mapping section:
 *   23505 → duplicate entry (units_one_admin_per_building or generic)
 *   23514 → immutable field / dead transition / invalid transition
 *   23503 → foreign key (active children blocking deactivation)
 *   42501 → RLS denial
 *   P0001 → RPC raise_exception (matched via message substring)
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
      case '23505':
        if (err.details?.includes('units_one_admin_per_building')) {
          toast.error('Ya existe una unidad administrativa en este edificio.');
        } else {
          toast.error('Ya existe un registro con esos datos.');
        }
        return;
      case '23514':
        if (err.message.includes('equipment') && err.message.includes('immutable')) {
          toast.error('No se puede modificar este campo una vez creado el equipo.');
        } else if (err.message.includes('equipment.status transitions out of dead')) {
          toast.error('Un equipo dado de baja no puede reactivarse.');
        } else if (err.message.includes('invalid equipment.status transition')) {
          toast.error('Transición de estado no permitida.');
        } else {
          toast.error('Validación fallida. Revisá los datos.');
        }
        return;
      case '23503':
        toast.error('No se puede desactivar: tiene registros activos asociados.');
        return;
      case '42501':
        toast.error('No tenés permiso para esta operación.');
        return;
      case 'P0001':
        if (
          typeof err.message === 'string' &&
          err.message.toLowerCase().includes('replace')
        ) {
          toast.error('No se pudo completar el reemplazo. Revisá los datos.');
        } else {
          toast.error(`Error del servidor. Intentá de nuevo.`);
        }
        return;
      default:
        toast.error(`Error ${err.code}. Reintentá.`);
        return;
    }
  }

  // Generic unhandled
  toast.error('Ocurrió un error. Intentá de nuevo.');
}
