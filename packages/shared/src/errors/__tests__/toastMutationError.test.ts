import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toastMutationError } from '../toastMutationError';

describe('toastMutationError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-SHARED-ERROR-1.1 — Network error branch
  it('TypeError (network) → returns canonical network-error message', () => {
    const result = toastMutationError(new TypeError('Failed to fetch'));
    expect(result).toBe('Error de conexión. Intentá de nuevo.');
  });

  it('network error via message string → returns canonical network-error message', () => {
    const result = toastMutationError({ message: 'Network timeout occurred', code: 'TIMEOUT' });
    expect(result).toBe('Error de conexión. Intentá de nuevo.');
  });

  // REQ-SHARED-ERROR-1.2 — RLS denial (42501)
  it('42501 → returns canonical permission-denied message', () => {
    const result = toastMutationError({ code: '42501', message: 'permission denied' });
    expect(result).toBe('No tenés permiso para esta operación.');
  });

  // REQ-SHARED-ERROR-1.3 — Unique violation (23505) — built-in fallback
  it('23505 with no matching extraHandlers → returns canonical duplicate-record message', () => {
    const result = toastMutationError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Key (name)=(...) already exists',
    });
    expect(result).toBe('Ya existe un registro con esos datos.');
  });

  // REQ-SHARED-ERROR-1.4 — Unique violation (23505) — admin-injected case
  it('23505 with extraHandlers matching constraint → returns app-specific message', () => {
    const adminHandlers = {
      '23505': (e: { code: string; message: string; details?: string | null }) => {
        if (e.details?.includes('equipment_serial_building_id_key')) {
          return 'Ya existe un equipo con ese serial en este edificio.';
        }
        return undefined;
      },
    };
    const result = toastMutationError(
      {
        code: '23505',
        message: 'duplicate key value',
        details: 'Key (serial, building_id)=(...) conflicts with equipment_serial_building_id_key',
      },
      { extraHandlers: adminHandlers },
    );
    expect(result).toBe('Ya existe un equipo con ese serial en este edificio.');
  });

  it('23505 with extraHandlers that do not match → falls back to built-in', () => {
    const adminHandlers = {
      '23505': (e: { code: string; message: string; details?: string | null }) => {
        if (e.details?.includes('equipment_serial_building_id_key')) {
          return 'Ya existe un equipo con ese serial en este edificio.';
        }
        return undefined;
      },
    };
    const result = toastMutationError(
      {
        code: '23505',
        message: 'duplicate key value',
        details: 'Key (email)=(...) already exists',
      },
      { extraHandlers: adminHandlers },
    );
    expect(result).toBe('Ya existe un registro con esos datos.');
  });

  // REQ-SHARED-ERROR-1.5 — Immutable field violation (23514)
  it('23514 → returns canonical immutable-field message', () => {
    const result = toastMutationError({
      code: '23514',
      message: 'check constraint violation',
    });
    expect(result).toBe('Validación fallida. Revisá los datos.');
  });

  // REQ-SHARED-ERROR-1.6 — FK blocker (23503)
  it('23503 → returns canonical FK-constraint message', () => {
    const result = toastMutationError({ code: '23503', message: 'foreign key violation' });
    expect(result).toBe('No se puede desactivar: tiene registros activos asociados.');
  });

  // REQ-SHARED-ERROR-1.7 — P0001 RPC message substring match
  it('P0001 with configure_key substring → returns matched RPC message', () => {
    const result = toastMutationError({
      code: 'P0001',
      message: 'configure_key: order item not found',
    });
    expect(result).toBe('Error al configurar la llave. Revisá los datos.');
  });

  it('P0001 with create_order substring → returns matched RPC message', () => {
    const result = toastMutationError({
      code: 'P0001',
      message: 'create_order: at least one item is required',
    });
    expect(result).toBe('Error al crear la orden. Revisá los datos.');
  });

  it('P0001 with replace substring → returns matched RPC message', () => {
    const result = toastMutationError({
      code: 'P0001',
      message: 'replace equipment failed',
    });
    expect(result).toBe('No se pudo completar el reemplazo. Revisá los datos.');
  });

  it('P0001 with record_order_key_pickup substring → returns matched RPC message', () => {
    const result = toastMutationError({
      code: 'P0001',
      message: 'record_order_key_pickup: order must be ready_for_pickup',
    });
    expect(result).toBe('Error al registrar el retiro. La orden debe estar lista para retiro.');
  });

  // REQ-SHARED-ERROR-1.8 — Unknown SQLSTATE fallback
  it('unknown SQLSTATE → returns non-empty human-readable string without raw code', () => {
    const result = toastMutationError({ code: '99999', message: 'some db error' });
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // REQ-SHARED-ERROR-1.9 — extraHandlers extensibility — exactly matching handler fires
  it('extraHandlers with two keys — only matching handler fires', () => {
    let firedKeys: string[] = [];
    const handlers = {
      '23505': (e: { code: string }) => {
        firedKeys.push('23505');
        return 'Matched 23505';
      },
      '23514': (e: { code: string }) => {
        firedKeys.push('23514');
        return 'Matched 23514';
      },
    };
    const result = toastMutationError({ code: '23505', message: 'dup key' }, { extraHandlers: handlers });
    expect(result).toBe('Matched 23505');
    expect(firedKeys).toEqual(['23505']);
    expect(firedKeys).not.toContain('23514');
  });

  // toast callback is invoked with the resolved message
  it('opts.toast is called with the resolved message string', () => {
    const mockToast = vi.fn();
    toastMutationError({ code: '42501', message: 'denied' }, { toast: mockToast });
    expect(mockToast).toHaveBeenCalledWith('No tenés permiso para esta operación.');
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('when opts.toast is omitted, function still returns the correct string', () => {
    const result = toastMutationError({ code: '42501', message: 'denied' });
    expect(result).toBe('No tenés permiso para esta operación.');
  });

  // P0001 fallback (unknown substring)
  it('P0001 without known substring → returns server error fallback', () => {
    const result = toastMutationError({ code: 'P0001', message: 'unknown server error' });
    expect(result).toBe('Error del servidor. Intentá de nuevo.');
  });

  // Generic non-postgrest
  it('generic non-postgrest error → returns generic retry message', () => {
    const result = toastMutationError(new Error('Something exploded'));
    expect(result).toBe('Ocurrió un error. Intentá de nuevo.');
  });
});
