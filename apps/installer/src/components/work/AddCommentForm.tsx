import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAddComment } from '@/hooks/useAddComment';

interface AddCommentFormProps {
  ticketId: string;
}

/**
 * AddCommentForm — textarea + submit; optimistic insert via useAddComment.
 * Clears textarea on success. Satisfies tickets R2.
 */
export function AddCommentForm({ ticketId }: AddCommentFormProps) {
  const [body, setBody] = useState('');
  const addComment = useAddComment();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    addComment.mutate(
      { ticketId, body: trimmed },
      {
        onSuccess: () => {
          setBody('');
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        placeholder="Escribí un comentario…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        className="text-sm"
        disabled={addComment.isPending}
      />
      <Button
        type="submit"
        size="sm"
        disabled={!body.trim() || addComment.isPending}
      >
        {addComment.isPending ? 'Enviando…' : 'Comentar'}
      </Button>
    </form>
  );
}
