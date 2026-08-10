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

  // 23505 cases
  it('23505 with units_one_admin_per_building detail → admin unit toast', () => {
    toastMutationError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Key (building_id)=(...) conflicts with units_one_admin_per_building',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Ya existe una unidad administrativa en este edificio.',
    );
  });

  it('23505 without specific detail → generic duplicate toast', () => {
    toastMutationError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Key (name)=(...) already exists',
    });
    expect(toast.error).toHaveBeenCalledWith('Ya existe un registro con esos datos.');
  });

  it('23505 with null details → generic duplicate toast', () => {
    toastMutationError({ code: '23505', message: 'duplicate key', details: null });
    expect(toast.error).toHaveBeenCalledWith('Ya existe un registro con esos datos.');
  });

  // 23514 cases
  it('23514 with immutable equipment field → immutable field toast', () => {
    toastMutationError({
      code: '23514',
      message: 'equipment serial_number is immutable and cannot be changed',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'No se puede modificar este campo una vez creado el equipo.',
    );
  });

  it('23514 with dead transition → dead transition toast', () => {
    toastMutationError({
      code: '23514',
      message: 'equipment.status transitions out of dead are not allowed',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Un equipo dado de baja no puede reactivarse.',
    );
  });

  it('23514 with invalid equipment.status transition → invalid transition toast', () => {
    toastMutationError({
      code: '23514',
      message: 'invalid equipment.status transition from active to dead',
    });
    expect(toast.error).toHaveBeenCalledWith('Transición de estado no permitida.');
  });

  it('23514 with other message → generic validation toast', () => {
    toastMutationError({
      code: '23514',
      message: 'check constraint violation on units',
    });
    expect(toast.error).toHaveBeenCalledWith('Validación fallida. Revisá los datos.');
  });

  // 23503 case
  it('23503 → active children toast', () => {
    toastMutationError({ code: '23503', message: 'foreign key violation' });
    expect(toast.error).toHaveBeenCalledWith(
      'No se puede desactivar: tiene registros activos asociados.',
    );
  });

  // 42501 case
  it('42501 → permission denied toast', () => {
    toastMutationError({ code: '42501', message: 'permission denied' });
    expect(toast.error).toHaveBeenCalledWith(
      'No tenés permiso para esta operación.',
    );
  });

  // P0001 case
  it('P0001 with replace in message → replace error toast', () => {
    toastMutationError({
      code: 'P0001',
      message: 'replace equipment failed: equipment already replaced',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'No se pudo completar el reemplazo. Revisá los datos.',
    );
  });

  it('P0001 without replace → generic server error', () => {
    toastMutationError({ code: 'P0001', message: 'unknown server error' });
    expect(toast.error).toHaveBeenCalledWith('Error del servidor. Intentá de nuevo.');
  });

  // Unknown code
  it('unknown SQLSTATE → generic error with code', () => {
    toastMutationError({ code: '99999', message: 'some db error' });
    expect(toast.error).toHaveBeenCalledWith('Error 99999. Reintentá.');
  });

  // Network errors
  it('TypeError (network) → connection error', () => {
    toastMutationError(new TypeError('Failed to fetch'));
    expect(toast.error).toHaveBeenCalledWith('Error de conexión. Intentá de nuevo.');
  });

  it('network error via message string → connection error', () => {
    toastMutationError({ message: 'Network timeout occurred', code: 'TIMEOUT_CODE' });
    expect(toast.error).toHaveBeenCalledWith('Error de conexión. Intentá de nuevo.');
  });

  // Generic error
  it('generic non-postgrest error → generic retry message', () => {
    toastMutationError(new Error('Something exploded'));
    expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Intentá de nuevo.');
  });

  // --- admin-ordenes new branches ---

  // 23505 orders_order_number
  it('23505 with orders_order_number detail → order number duplicate toast', () => {
    toastMutationError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Key (order_number)=(...) conflicts with orders_order_number',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Ya existe una orden con ese número. Reintentá.',
    );
  });

  // P0001 configure_key
  it('P0001 with configure_key in message → configure key error toast', () => {
    toastMutationError({
      code: 'P0001',
      message: 'configure_key: order item not found',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Error al configurar la llave. Revisá los datos.',
    );
  });

  // P0001 create_order
  it('P0001 with create_order in message → create order error toast', () => {
    toastMutationError({
      code: 'P0001',
      message: 'create_order: at least one item is required',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Error al crear la orden. Revisá los datos.',
    );
  });

  // 23503 cancel context
  it('23503 with cancel in message → cancel context toast', () => {
    toastMutationError({
      code: '23503',
      message: 'cannot cancel: foreign key violation on order_items',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'No se puede cancelar: tiene registros asociados.',
    );
  });

  // 23503 non-cancel context still uses the generic message
  it('23503 without cancel in message → generic deactivate toast', () => {
    toastMutationError({
      code: '23503',
      message: 'foreign key violation on buildings',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'No se puede desactivar: tiene registros activos asociados.',
    );
  });

  // --- particulares change branches ---

  // 23505 particulares unit key
  it('23505 with particulares_unit_id_key detail → duplicate particular toast', () => {
    toastMutationError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "particulares_unit_id_key"',
      details: 'Key (unit_id)=(u-1) already exists.',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Ya existe un particular con ese DNI o unidad.',
    );
  });

  // 23505 particulares dni key
  it('23505 with particulares in details → duplicate particular toast', () => {
    toastMutationError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Key (dni)=(30111222) conflicts with particulares_dni_key',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Ya existe un particular con ese DNI o unidad.',
    );
  });

  // 23505 particulares via message (details absent)
  it('23505 with particulares in message → duplicate particular toast', () => {
    toastMutationError({
      code: '23505',
      message: 'particulares unique violation',
      details: null,
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Ya existe un particular con ese DNI o unidad.',
    );
  });

  // 23514 pickup DNI mismatch (order pickup path)
  it('23514 pickup DNI mismatch → authorized pickup person toast', () => {
    toastMutationError({
      code: '23514',
      message: 'pickup DNI (99999999) does not match the order authorized DNI',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'El DNI de retiro no coincide con la persona autorizada para retirar.',
    );
  });

  // 23514 pickup DNI mismatch (key_request path)
  it('23514 key_request pickup DNI mismatch → authorized pickup person toast', () => {
    toastMutationError({
      code: '23514',
      message:
        'pickup DNI (99999999) does not match the authorized pickup person DNI (30111222) for this request',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'El DNI de retiro no coincide con la persona autorizada para retirar.',
    );
  });

  // P0001 record_order_key_pickup
  it('P0001 with record_order_key_pickup in message → pickup error toast', () => {
    toastMutationError({
      code: 'P0001',
      message:
        'record_order_key_pickup: order must be ready_for_pickup to register pickups',
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Error al registrar el retiro. La orden debe estar lista para retiro.',
    );
  });
});
