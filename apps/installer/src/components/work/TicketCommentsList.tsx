import { Loader2 } from 'lucide-react';
import type { TicketComment } from '@/hooks/useTicketComments';

interface TicketCommentsListProps {
  comments: TicketComment[];
}

/**
 * Formats a date as a relative human-readable string (e.g. "hace 5 min").
 * Operates purely on the ISO string; no external library required.
 */
function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/**
 * TicketCommentsList — chronological comment list (oldest first).
 * Rows where _pending === true show a pending visual indicator.
 * Satisfies tickets R1-SC2.
 */
export function TicketCommentsList({ comments }: TicketCommentsListProps) {
  if (comments.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">Sin comentarios aún.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {comments.map((comment) => (
        <li
          key={comment.id}
          className={`rounded-md border px-3 py-2 text-sm ${
            comment._pending ? 'opacity-60 border-dashed' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium truncate">
              {comment.author_full_name ?? 'Desconocido'}
            </span>
            <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {comment._pending && (
                <Loader2 className="h-3 w-3 animate-spin" aria-label="Enviando" />
              )}
              <span>{relativeTime(comment.created_at)}</span>
            </div>
          </div>
          <p className="mt-1 text-muted-foreground">{comment.body}</p>
        </li>
      ))}
    </ol>
  );
}
