import { SectionHeading, Skeleton, cn } from '@vitalock/ui';
import { formatDateTime } from '@/lib/format';
import { buildTareaTimeline, type TareaTimelineSource } from '@/lib/tareas/tareaTimeline';
import type { TareaTimelineTone } from '@/lib/tareas/tareaTimeline';
import type { TicketComment } from '@/hooks/useTicketComments';
import { TicketCommentsList } from './TicketCommentsList';

interface TareaTraceabilityCardProps {
  tarea: TareaTimelineSource;
  comments: TicketComment[];
  commentsLoading?: boolean;
}

const DOT_TONE: Record<TareaTimelineTone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  danger: 'bg-destructive',
};

/**
 * TareaTraceabilityCard — who did what and when on a ticket: a short
 * vertical timeline (opened → assigned → resolved / cancelled) followed by
 * the installer's comments.
 */
export function TareaTraceabilityCard({
  tarea,
  comments,
  commentsLoading = false,
}: TareaTraceabilityCardProps) {
  const timeline = buildTareaTimeline(tarea);

  return (
    <div className="bg-card flex flex-col gap-4 rounded-md border p-4">
      <SectionHeading title="Trazabilidad" variant="secondary" />

      <ol className="flex flex-col" aria-label="Línea de tiempo">
        {timeline.map((entry, index) => {
          const isLast = index === timeline.length - 1;
          return (
            <li key={entry.key} className="relative flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT_TONE[entry.tone])}
                />
                {!isLast && <span aria-hidden="true" className="bg-border mt-1 w-px flex-1" />}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {entry.label}
                  {entry.actor && (
                    <span className="text-muted-foreground font-normal"> · {entry.actor}</span>
                  )}
                </span>
                {entry.at && (
                  <span className="text-muted-foreground text-xs">{formatDateTime(entry.at)}</span>
                )}
                {entry.detail && (
                  <p className="text-muted-foreground whitespace-pre-line text-sm">
                    {entry.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs uppercase">Comentarios</span>
        {commentsLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando comentarios">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <TicketCommentsList comments={comments} />
        )}
      </div>
    </div>
  );
}
