import { toast } from 'sonner';
import { toastMutationError as _toastMutationError, type ExtraHandlersMap } from '@vitalock/shared';

/**
 * Installer-specific extra handlers for 23514 unique constraint errors.
 * These cover installer-specific messages not in the shared built-in list.
 */
const installerExtraHandlers: ExtraHandlersMap = {
  '23514': () => 'El estado ya fue actualizado. Actualizá la lista.',
  '42501': () =>
    'No tenés permiso. Es posible que el ticket haya sido reasignado.',
};

/**
 * Installer error mapper. Wraps `toastMutationError` from `@vitalock/shared`
 * with installer-specific message overrides and wires `sonner` as the toast facade.
 */
export function toastMutationError(err: unknown): void {
  _toastMutationError(err, { extraHandlers: installerExtraHandlers, toast: toast.error });
}
