import { EmptyState } from '@vitalock/ui';
import { formatDateTime } from '@/lib/format';
import type { TicketComment } from '@/hooks/useTicketComments';

interface TicketCommentsListProps {
  comments: TicketComment[];
}

/**
 * TicketCommentsList — read-only chronological list (oldest first) of the
 * comments the installer left on a ticket. The admin only reads them; adding
 * comments stays an installer-side action.
 */
export function TicketCommentsList({ comments }: TicketCommentsListProps) {
  if (comments.length === 0) {
    return <EmptyState message="Sin comentarios." />;
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Comentarios">
      {comments.map((comment) => (
        <li key={comment.id} className="rounded-md border px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">
              {comment.author_full_name ?? 'Desconocido'}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatDateTime(comment.created_at)}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 whitespace-pre-line">{comment.body}</p>
        </li>
      ))}
    </ol>
  );
}
