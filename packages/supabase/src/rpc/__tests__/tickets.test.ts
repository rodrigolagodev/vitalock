import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '../../client';
import {
  completeAuthorizations,
  configureTechnicalTicketEquipment,
  createAndAssignEquipment,
  resolveEquipmentInstallation,
  resolveEquipmentReplacement,
  resolveTicket,
} from '../tickets';

const mockRpc = vi.fn();
const mockClient = { rpc: mockRpc } as unknown as TypedSupabaseClient;

function lastArgs(): Record<string, unknown> {
  const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
  return args;
}

describe('resolveEquipmentInstallation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the required args and omits every nullish optional', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'eq-1', error: null });
    const id = await resolveEquipmentInstallation(mockClient, {
      ticketId: 't-1',
      serial: 'SN-1',
      unitId: null,
      note: undefined,
    });
    expect(id).toBe('eq-1');
    expect(mockRpc).toHaveBeenCalledWith('resolve_equipment_installation', {
      p_ticket_id: 't-1',
      p_serial: 'SN-1',
    });
  });

  it('forwards all optionals when defined', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'eq-2', error: null });
    await resolveEquipmentInstallation(mockClient, {
      ticketId: 't-2',
      serial: 'SN-2',
      unitId: 'u-1',
      note: 'installed',
      actorStaffId: 's-1',
    });
    expect(lastArgs()).toEqual({
      p_ticket_id: 't-2',
      p_serial: 'SN-2',
      p_unit_id: 'u-1',
      p_note: 'installed',
      p_actor_staff_id: 's-1',
    });
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: 'P0001', message: 'SERIAL_TAKEN' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      resolveEquipmentInstallation(mockClient, { ticketId: 't-3', serial: 'SN-3' }),
    ).rejects.toBe(error);
  });
});

describe('resolveEquipmentReplacement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the four required args and omits nullish optionals', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'eq-new', error: null });
    const id = await resolveEquipmentReplacement(mockClient, {
      ticketId: 't-1',
      oldEquipmentId: 'eq-old',
      newSerial: 'SN-N',
      newModel: 'M2',
      newDescription: null,
    });
    expect(id).toBe('eq-new');
    expect(lastArgs()).toEqual({
      p_ticket_id: 't-1',
      p_old_equipment_id: 'eq-old',
      p_new_serial: 'SN-N',
      p_new_model: 'M2',
    });
  });

  it('forwards the optional description, note and actor', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'eq-new', error: null });
    await resolveEquipmentReplacement(mockClient, {
      ticketId: 't-1',
      oldEquipmentId: 'eq-old',
      newSerial: 'SN-N',
      newModel: 'M2',
      newDescription: 'Rooftop unit',
      note: 'swapped',
      actorStaffId: 's-9',
    });
    const args = lastArgs();
    expect(args.p_new_description).toBe('Rooftop unit');
    expect(args.p_note).toBe('swapped');
    expect(args.p_actor_staff_id).toBe('s-9');
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: 'P0001', message: 'OLD_EQUIPMENT_NOT_FOUND' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      resolveEquipmentReplacement(mockClient, {
        ticketId: 't-1',
        oldEquipmentId: 'x',
        newSerial: 'y',
        newModel: 'z',
      }),
    ).rejects.toBe(error);
  });
});

describe('resolveTicket', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only the ticket id when no optionals are given', async () => {
    mockRpc.mockResolvedValueOnce({ data: 't-1', error: null });
    await resolveTicket(mockClient, { ticketId: 't-1' });
    expect(mockRpc).toHaveBeenCalledWith('resolve_ticket', { p_ticket_id: 't-1' });
  });

  it('forwards note and actor when defined, drops them when null', async () => {
    mockRpc.mockResolvedValueOnce({ data: 't-1', error: null });
    await resolveTicket(mockClient, { ticketId: 't-1', note: 'done', actorStaffId: null });
    expect(lastArgs()).toEqual({ p_ticket_id: 't-1', p_note: 'done' });
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: 'P0001', message: 'TICKETS_TERMINAL' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(resolveTicket(mockClient, { ticketId: 't-1' })).rejects.toBe(error);
  });
});

describe('createAndAssignEquipment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the empty-string sentinel when description is absent', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'eq-1', error: null });
    await createAndAssignEquipment(mockClient, {
      ticketId: 't-1',
      buildingId: 'b-1',
      serial: 'SN',
      model: 'M',
      accessType: 'vehicular',
    });
    expect(lastArgs().p_description).toBe('');
  });

  it('forwards a real description and every required arg', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'eq-1', error: null });
    const id = await createAndAssignEquipment(mockClient, {
      ticketId: 't-1',
      buildingId: 'b-1',
      serial: 'SN',
      model: 'M',
      description: 'Front gate',
      accessType: 'pedestrian',
    });
    expect(id).toBe('eq-1');
    expect(mockRpc).toHaveBeenCalledWith('create_and_assign_equipment', {
      p_ticket_id: 't-1',
      p_building_id: 'b-1',
      p_serial: 'SN',
      p_model: 'M',
      p_description: 'Front gate',
      p_access_type: 'pedestrian',
    });
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: '23505', message: 'duplicate serial' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      createAndAssignEquipment(mockClient, {
        ticketId: 't-1',
        buildingId: 'b-1',
        serial: 'SN',
        model: 'M',
        accessType: 'x',
      }),
    ).rejects.toBe(error);
  });
});

describe('completeAuthorizations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes both id lists and the staff id through unchanged', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await completeAuthorizations(mockClient, {
      installIds: ['a-1', 'a-2'],
      removeIds: [],
      staffId: 's-1',
    });
    expect(mockRpc).toHaveBeenCalledWith('complete_authorizations', {
      p_install_ids: ['a-1', 'a-2'],
      p_remove_ids: [],
      p_staff_id: 's-1',
    });
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: '42501', message: 'insufficient_privilege' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      completeAuthorizations(mockClient, { installIds: [], removeIds: [], staffId: 's-1' }),
    ).rejects.toBe(error);
  });
});

describe('configureTechnicalTicketEquipment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('omits the model when absent so the SQL default applies', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await configureTechnicalTicketEquipment(mockClient, { ticketId: 't-1', newSerial: 'SN' });
    expect(mockRpc).toHaveBeenCalledWith('configure_technical_ticket_equipment', {
      p_ticket_id: 't-1',
      p_new_serial: 'SN',
    });
  });

  it('forwards the model when given', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await configureTechnicalTicketEquipment(mockClient, {
      ticketId: 't-1',
      newSerial: 'SN',
      newModel: 'M3',
    });
    expect(lastArgs().p_new_model).toBe('M3');
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: 'P0001', message: 'TICKET_NOT_PENDING' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      configureTechnicalTicketEquipment(mockClient, { ticketId: 't-1', newSerial: 'SN' }),
    ).rejects.toBe(error);
  });
});
