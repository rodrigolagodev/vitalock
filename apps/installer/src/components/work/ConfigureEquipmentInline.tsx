import { useEffect, useState } from 'react';
import {
  Button,
  FormField,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@vitalock/ui';
import { useOfflineGate } from '@/hooks/useOfflineGate';
import { useConfigureTechnicalTicketEquipment } from '@/hooks/useConfigureTechnicalTicketEquipment';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface ConfigureEquipmentInlineProps {
  ticket: Pick<
    AssignedTicket,
    'id' | 'category' | 'pending_new_serial' | 'pending_new_model' | 'intended_product_name'
  >;
}

const HEADINGS: Record<'install_equipment' | 'replace_equipment', string> = {
  install_equipment: 'Equipo a instalar',
  replace_equipment: 'Equipo de reemplazo',
};

/**
 * Configure flow for the two-step equipment task flow, presented in a bottom sheet. Loads
 * pending_new_serial + pending_new_model into the ticket via
 * configure_technical_ticket_equipment. Physical work (create/replace
 * equipment, key transfer, stock movements) happens when the installer later
 * marks the task resolved through the batch "Marcar resueltos" flow.
 */
export function ConfigureEquipmentInline({ ticket }: ConfigureEquipmentInlineProps) {
  const category = ticket.category as 'install_equipment' | 'replace_equipment';
  const heading = HEADINGS[category];
  const configured = Boolean(ticket.pending_new_serial);
  const [open, setOpen] = useState(false);

  const [serial, setSerial] = useState(ticket.pending_new_serial ?? '');
  const [model, setModel] = useState(ticket.pending_new_model ?? '');
  const [error, setError] = useState<string | null>(null);

  const configure = useConfigureTechnicalTicketEquipment();
  const { offline, reason } = useOfflineGate();

  useEffect(() => {
    if (open) {
      setSerial(ticket.pending_new_serial ?? '');
      setModel(ticket.pending_new_model ?? '');
      setError(null);
    }
  }, [open, ticket.pending_new_serial, ticket.pending_new_model]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (offline) return;
    const trimmedSerial = serial.trim();
    if (!trimmedSerial) {
      setError('El número de serie es obligatorio.');
      return;
    }
    setError(null);
    configure.mutate(
      {
        ticketId: ticket.id,
        newSerial: trimmedSerial,
        newModel: model.trim().length > 0 ? model.trim() : null,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  const isPending = configure.isPending;
  const modelPlaceholder = ticket.intended_product_name ?? 'Modelo (opcional)';

  return (
    <div className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-footnote font-semibold uppercase">
          {heading}
        </span>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {configured ? 'Editar' : 'Configurar equipo'}
        </Button>
      </div>

      {configured && (
        <div className="flex flex-col gap-1 text-sm">
          <span>
            <span className="text-muted-foreground">Serie:</span> {ticket.pending_new_serial}
          </span>
          <span>
            <span className="text-muted-foreground">Modelo:</span>{' '}
            {ticket.pending_new_model ?? ticket.intended_product_name ?? '—'}
          </span>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{configured ? 'Editar equipo' : 'Configurar equipo'}</SheetTitle>
            {!configured && (
              <SheetDescription>
                Cargá el serie del nuevo equipo. Después vas a poder finalizar la tarea.
              </SheetDescription>
            )}
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <FormField label="Número de serie" error={error ?? undefined}>
              <Input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                disabled={isPending}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </FormField>
            <FormField label="Modelo">
              <Input
                placeholder={modelPlaceholder}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isPending}
              />
            </FormField>
            {reason && <p className="text-footnote text-muted-foreground">{reason}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || offline}>
                {isPending ? 'Guardando…' : 'Guardar equipo'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
