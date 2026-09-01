import { useEffect, useState } from 'react';
import { Button, Input } from '@vitalock/ui';
import { useConfigureTechnicalTicketEquipment } from '@/hooks/useConfigureTechnicalTicketEquipment';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

interface ConfigureEquipmentInlineProps {
  ticket: AssignedTicket;
}

const HEADINGS: Record<'install_equipment' | 'replace_equipment', string> = {
  install_equipment: 'Equipo a instalar',
  replace_equipment: 'Equipo de reemplazo',
};

/**
 * Inline configure form shown inside TicketCard for the two-step equipment
 * task flow. Loads pending_new_serial + pending_new_model into the ticket via
 * configure_technical_ticket_equipment. Physical work (create/replace
 * equipment, key transfer, stock movements) happens when the installer later
 * marks the task resolved through the batch "Marcar resueltos" flow.
 */
export function ConfigureEquipmentInline({ ticket }: ConfigureEquipmentInlineProps) {
  const category = ticket.category as 'install_equipment' | 'replace_equipment';
  const heading = HEADINGS[category];
  const configured = Boolean(ticket.pending_new_serial);
  const [editing, setEditing] = useState(false);
  const showForm = !configured || editing;

  const [serial, setSerial] = useState(ticket.pending_new_serial ?? '');
  const [model, setModel] = useState(ticket.pending_new_model ?? '');
  const [error, setError] = useState<string | null>(null);

  const configure = useConfigureTechnicalTicketEquipment();

  useEffect(() => {
    if (showForm) {
      setSerial(ticket.pending_new_serial ?? '');
      setModel(ticket.pending_new_model ?? '');
      setError(null);
    }
  }, [showForm, ticket.pending_new_serial, ticket.pending_new_model]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      { onSuccess: () => setEditing(false) },
    );
  };

  const isPending = configure.isPending;
  const modelPlaceholder = ticket.intended_product_name ?? 'Modelo (opcional)';

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {heading}
        </span>
        {configured && !editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={isPending}
          >
            Editar
          </Button>
        )}
      </div>

      {!showForm && configured && (
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

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          {!configured && (
            <p className="text-xs text-muted-foreground">
              Cargá el serie del nuevo equipo. Después vas a poder finalizar la tarea.
            </p>
          )}
          <Input
            placeholder="Número de serie"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            disabled={isPending}
            aria-label="Número de serie"
          />
          <Input
            placeholder={modelPlaceholder}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isPending}
            aria-label="Modelo"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            {configured && editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
            )}
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Guardar equipo'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
