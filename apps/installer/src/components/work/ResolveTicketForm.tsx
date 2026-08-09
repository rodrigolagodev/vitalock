import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAdvanceTicket } from '@/hooks/useAdvanceTicket';

const resolveSchema = z.object({
  resolution_notes: z
    .string()
    .min(1, 'Escribí una nota de resolución.'),
});

type ResolveFormValues = z.infer<typeof resolveSchema>;

interface ResolveTicketFormProps {
  ticketId: string;
}

/**
 * ResolveTicketForm — RHF + Zod form for resolving a ticket.
 *
 * Two-step inline confirm:
 *   1st tap "Resolver" → reveals the form.
 *   Submit → pessimistic mutation via useAdvanceTicket.
 *
 * resolution_notes is required per tickets R3-SC2.
 * resolved_by_staff_id is injected by the hook (R3-SC3).
 * Satisfies tickets R3, R3-SC2, R3-SC3.
 */
export function ResolveTicketForm({ ticketId }: ResolveTicketFormProps) {
  const [expanded, setExpanded] = useState(false);
  const advance = useAdvanceTicket();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ResolveFormValues>({
    resolver: zodResolver(resolveSchema),
    defaultValues: { resolution_notes: '' },
  });

  function onSubmit(values: ResolveFormValues) {
    advance.mutate(
      { ticketId, resolution_notes: values.resolution_notes },
      {
        onSuccess: () => {
          reset();
          setExpanded(false);
        },
      },
    );
  }

  if (!expanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExpanded(true)}
        className="w-full"
      >
        Resolver
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      <Textarea
        {...register('resolution_notes')}
        placeholder="Nota de resolución (obligatorio)"
        rows={3}
        className="text-sm"
        disabled={advance.isPending}
      />
      {errors.resolution_notes && (
        <p className="text-xs text-destructive" role="alert">
          {errors.resolution_notes.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setExpanded(false);
          }}
          disabled={advance.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={advance.isPending}
          className="flex-1"
        >
          {advance.isPending ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando…
            </span>
          ) : (
            'Confirmar resolución'
          )}
        </Button>
      </div>
    </form>
  );
}
