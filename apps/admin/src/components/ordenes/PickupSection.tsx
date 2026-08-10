import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useMutateOrden } from '@/hooks/useMutateOrden';
import type { ParticularRow } from '@/hooks/useParticulares';
import type { OrdenDetailRow } from '@/hooks/useOrden';
import { ParticularSelector } from '../particulares/ParticularSelector';
import { QuickParticularCreateDialog } from '../particulares/QuickParticularCreateDialog';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

interface PickupSectionProps {
  orden: OrdenDetailRow;
}

/**
 * Pickup-person selection for particular orders ("quién retira la llave").
 * Offers: checkbox "usar mismos datos de compra" (pickup_particular_id =
 * particular_id), an existing-particular search, and inline creation.
 * The section renders only for particular, non-terminal orders — the page
 * gate (task 2.7) and this defensive gate must agree.
 */
export function PickupSection({ orden }: PickupSectionProps) {
  const { setPickupPerson } = useMutateOrden();
  const [createOpen, setCreateOpen] = useState(false);

  const isParticular = orden.client_type === 'particular';
  const nonTerminal = !TERMINAL_STATUSES.has(orden.status);

  // All hooks run before the render gate below (rules-of-hooks). The pickup
  // query is disabled when no pickup person is set or it is the buyer, so no
  // fetch fires for administration or buyer-reuse orders.
  const buyer = orden.particulares as ParticularRow | null;
  const pickupParticularId = orden.pickup_particular_id;
  const useSameAsBuyer = Boolean(buyer && pickupParticularId === buyer.id);

  const { data: pickupPerson } = useQuery({
    queryKey: ['admin', 'particulares', 'one', pickupParticularId ?? ''],
    enabled: Boolean(pickupParticularId && (!buyer || pickupParticularId !== buyer.id)),
    queryFn: async (): Promise<ParticularRow> => {
      const { data, error } = await supabase
        .from('particulares')
        .select('id, unit_id, dni, full_name, phone, email')
        .eq('id', pickupParticularId as string)
        .single();
      if (error) throw error;
      return data as ParticularRow;
    },
  });

  if (!isParticular || !nonTerminal) return null;

  const currentPickup: ParticularRow | null = useSameAsBuyer ? buyer : (pickupPerson ?? null);
  const saving = setPickupPerson.isPending;

  const save = (pickup_particular_id: string | null) => {
    setPickupPerson.mutate({ id: orden.id, pickup_particular_id });
  };

  const handleCheckbox = (checked: boolean) => {
    if (checked && buyer) {
      save(buyer.id);
    } else if (!checked && useSameAsBuyer) {
      save(null);
    }
  };

  const handleSelect = (particular: ParticularRow | null) => {
    save(particular?.id ?? null);
  };

  const handleCreated = (particular: ParticularRow) => {
    setCreateOpen(false);
    save(particular.id);
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">Quién retira la llave</h2>

      <label className="flex w-fit cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={useSameAsBuyer}
          disabled={!buyer || saving}
          onChange={(e) => handleCheckbox(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <span className="text-sm">Usar mismos datos de compra</span>
      </label>

      {!useSameAsBuyer && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <ParticularSelector
              value={currentPickup}
              onChange={handleSelect}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="shrink-0"
              disabled={saving}
            >
              Crear particular
            </Button>
          </div>
        </div>
      )}

      {currentPickup && (
        <p className="text-sm text-muted-foreground">
          Retira: {currentPickup.full_name} (DNI {currentPickup.dni})
        </p>
      )}

      <QuickParticularCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </section>
  );
}
