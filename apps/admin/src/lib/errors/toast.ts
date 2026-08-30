import { toast } from 'sonner';
import { toastMutationError as _toastMutationError, type ExtraHandlersMap } from '@vitalock/shared';

/**
 * Admin-specific extra handlers for 23505 unique constraint errors.
 * These cover admin-only constraint names not present in the shared built-in list.
 */
const adminExtraHandlers: ExtraHandlersMap = {
  '23505': (err) => {
    const details = err.details ?? '';
    const message = err.message ?? '';
    if (details.includes('units_one_admin_per_building')) {
      return 'Ya existe una unidad administrativa en este edificio.';
    }
    if (details.includes('administrations_tax_id_key') || details.includes('tax_id')) {
      return 'Ya existe una administración con ese CUIT/CUIL.';
    }
    if (details.includes('orders_order_number')) {
      return 'Ya existe una orden con ese número. Reintentá.';
    }
    if (details.includes('particulares') || message.includes('particulares')) {
      return 'Ya existe un particular con ese DNI o unidad.';
    }
    return undefined;
  },
  '23514': (err) => {
    const message = err.message ?? '';
    if (message.includes('equipment') && message.includes('immutable')) {
      return 'No se puede modificar este campo una vez creado el equipo.';
    }
    if (message.includes('equipment.status transitions out of dead')) {
      return 'Un equipo dado de baja no puede reactivarse.';
    }
    if (message.includes('invalid equipment.status transition')) {
      return 'Transición de estado no permitida.';
    }
    if (message.includes('pickup DNI') && message.includes('does not match')) {
      return 'El DNI de retiro no coincide con la persona autorizada para retirar.';
    }
    if (message.includes('products_reservado_le_total')) {
      return 'Operación rechazada: dejaría el stock disponible en negativo.';
    }
    return undefined;
  },
};

/**
 * Admin error mapper. Wraps `toastMutationError` from `@vitalock/shared`
 * with admin-specific constraint handlers and wires `sonner` as the toast facade.
 */
export function toastMutationError(err: unknown): void {
  _toastMutationError(err, { extraHandlers: adminExtraHandlers, toast: toast.error });
}
