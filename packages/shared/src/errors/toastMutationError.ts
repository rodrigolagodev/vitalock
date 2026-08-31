import type { PostgrestErrorLike } from './parseSupabaseError';
import { isNetworkError, isPostgrestError } from './parseSupabaseError';

export type ExtraHandler = (err: PostgrestErrorLike) => string | undefined;
export type ExtraHandlersMap = Partial<Record<string, ExtraHandler>>;

export interface ToastMutationErrorOptions {
  extraHandlers?: ExtraHandlersMap;
  toast?: (message: string) => void;
}

/**
 * P0001 built-in ordered substring list (case-insensitive match on err.message).
 * Slice C adds `create_and_assign_equipment`; Slice E adds `complete_authorizations`.
 */
const P0001_HANDLERS: Array<[substring: string, message: string]> = [
  ['configure_key', 'Error al configurar la llave. Revisá los datos.'],
  ['create_order', 'Error al crear la orden. Revisá los datos.'],
  ['replace', 'No se pudo completar el reemplazo. Revisá los datos.'],
  ['record_order_key_pickup', 'Error al registrar el retiro. La orden debe estar lista para retiro.'],
  ['create_and_assign_equipment', 'Error al crear y asignar el equipo. Revisá los datos.'],
  ['complete_authorizations', 'Error al confirmar el lote de llaves. Sincronizá y reintentá.'],
];

/**
 * Maps an unknown mutation error to a human-readable Spanish string.
 *
 * Handling order per ADR-6:
 *   1. Network error branch
 *   2. SQLSTATE switch (23505, 23514, 23503, 42501, P0001)
 *      - For each SQLSTATE, `extraHandlers[code]` is tried first; built-in fires if it
 *        returns undefined.
 *   3. Unknown-SQLSTATE fallback
 *   4. Generic non-Postgrest fallback
 *
 * Returns the resolved message string. If `opts.toast` is provided it is also called
 * with that string, letting callers keep a single-call site.
 */
export function toastMutationError(
  err: unknown,
  opts?: ToastMutationErrorOptions,
): string {
  const { extraHandlers, toast } = opts ?? {};

  let message: string;

  if (isNetworkError(err)) {
    message = 'Error de conexión. Intentá de nuevo.';
  } else if (isPostgrestError(err)) {
    message = resolvePostgrestMessage(err, extraHandlers);
  } else {
    message = 'Ocurrió un error. Intentá de nuevo.';
  }

  toast?.(message);
  return message;
}

function resolvePostgrestMessage(
  err: PostgrestErrorLike,
  extraHandlers?: ExtraHandlersMap,
): string {
  // Try extra handler for this SQLSTATE first.
  const extra = extraHandlers?.[err.code];
  if (extra) {
    const result = extra(err);
    if (result !== undefined && result !== '') {
      return result;
    }
  }

  switch (err.code) {
    case '23505':
      return 'Ya existe un registro con esos datos.';

    case '23514':
      return 'Validación fallida. Revisá los datos.';

    case '23503': {
      const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
      if (msg.includes('cancel')) {
        return 'No se puede cancelar: tiene registros asociados.';
      }
      return 'No se puede desactivar: tiene registros activos asociados.';
    }

    case '42501':
      return 'No tenés permiso para esta operación.';

    case 'P0001': {
      const lower = typeof err.message === 'string' ? err.message.toLowerCase() : '';
      for (const [substring, fallbackMsg] of P0001_HANDLERS) {
        if (lower.includes(substring)) {
          return fallbackMsg;
        }
      }
      return 'Error del servidor. Intentá de nuevo.';
    }

    default:
      return 'Ocurrió un error. Intentá de nuevo.';
  }
}
