import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface OrderKeyDetails {
  id: string;
  rfid_code: string;
  activated_at: string;
  picked_up_at: string | null;
  picked_up_by_name: string | null;
  picked_up_by_surname: string | null;
  picked_up_by_dni: string | null;
  unit: {
    id: string;
    number: string;
    unit_type: string | null;
    is_administrative: boolean;
    building: {
      id: string;
      name: string;
    } | null;
  } | null;
  authorizations: {
    id: string;
    equipment: {
      id: string;
      serial_number: string;
      model: string | null;
    } | null;
  }[];
}

/**
 * Detail query for a configured order key. Runs only when the dialog opens
 * (enabled=Boolean(keyId)). Two round-trips because key_authorizations lives
 * in operations schema and PostgREST cross-schema embeds through a chain are
 * fragile — clearer to fetch them independently.
 */
export function useOrderKeyDetails(keyId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'order-keys', 'details', keyId ?? ''],
    enabled: Boolean(keyId),
    queryFn: async (): Promise<OrderKeyDetails> => {
      const [{ data: keyRow, error: keyErr }, { data: authRows, error: authErr }] =
        await Promise.all([
          supabase
            .from('rfid_keys')
            .select(
              `id, rfid_code, activated_at,
               picked_up_at, picked_up_by_name, picked_up_by_surname, picked_up_by_dni,
               units!unit_id (
                 id, number, unit_type, is_administrative,
                 buildings!building_id ( id, name )
               )`,
            )
            .eq('id', keyId as string)
            .single(),
          supabase
            .schema('operations')
            .from('key_authorizations')
            .select(
              `id, equipment:equipment_id ( id, serial_number, model )`,
            )
            .eq('rfid_key_id', keyId as string),
        ]);

      if (keyErr) throw keyErr;
      if (authErr) throw authErr;

      type RawKey = {
        id: string;
        rfid_code: string;
        activated_at: string;
        picked_up_at: string | null;
        picked_up_by_name: string | null;
        picked_up_by_surname: string | null;
        picked_up_by_dni: string | null;
        units: {
          id: string;
          number: string;
          unit_type: string | null;
          is_administrative: boolean;
          buildings: { id: string; name: string } | null;
        } | null;
      };
      type RawAuth = {
        id: string;
        equipment: {
          id: string;
          serial_number: string;
          model: string | null;
        } | null;
      };

      const raw = keyRow as unknown as RawKey;
      const auths = (authRows ?? []) as unknown as RawAuth[];

      return {
        id: raw.id,
        rfid_code: raw.rfid_code,
        activated_at: raw.activated_at,
        picked_up_at: raw.picked_up_at,
        picked_up_by_name: raw.picked_up_by_name,
        picked_up_by_surname: raw.picked_up_by_surname,
        picked_up_by_dni: raw.picked_up_by_dni,
        unit: raw.units
          ? {
              id: raw.units.id,
              number: raw.units.number,
              unit_type: raw.units.unit_type,
              is_administrative: raw.units.is_administrative,
              building: raw.units.buildings,
            }
          : null,
        authorizations: auths.map((a) => ({
          id: a.id,
          equipment: a.equipment,
        })),
      };
    },
  });
}
