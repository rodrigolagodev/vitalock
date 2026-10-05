import { useState } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from '@vitalock/ui';
import { useAddComment } from '@/hooks/useAddComment';
import { useOfflineGate } from '@/hooks/useOfflineGate';

interface AddCommentFormProps {
  ticketId: string;
}

/**
 * AddCommentForm — an "Agregar comentario" trigger that opens a bottom sheet
 * with the textarea + submit; optimistic insert via useAddComment. Closes and
 * clears on success, and disables submit while offline. Satisfies tickets R2.
 */
export function AddCommentForm({ ticketId }: AddCommentFormProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const addComment = useAddComment();
  const { offline, reason } = useOfflineGate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || offline) return;

    addComment.mutate(
      { ticketId, body: trimmed },
      {
        onSuccess: () => {
          setBody('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Agregar comentario
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Agregar comentario</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <Textarea
            placeholder="Escribí un comentario…"
            aria-label="Comentario"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="md:text-base"
            disabled={addComment.isPending}
          />
          {reason && <p className="text-footnote text-muted-foreground">{reason}</p>}
          <Button type="submit" disabled={!body.trim() || addComment.isPending || offline}>
            {addComment.isPending ? 'Enviando…' : 'Comentar'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
