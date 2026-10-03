import { Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TruncationNoticeProps {
  /** Whether the list was cut at the row cap. Nothing renders when false. */
  truncated: boolean;
  /** Rows actually loaded and shown. */
  shown: number;
  /** Exact number of rows matching the current filters. */
  total: number | undefined;
  /**
   * Follow-up sentence. Defaults to asking the user to narrow server-side
   * filters; override it where filters run client-side and cannot help.
   */
  hint?: string;
  className?: string;
}

const numberFormat = new Intl.NumberFormat('es-AR');
const DEFAULT_HINT = 'Refiná los filtros para ver el resto.';

/**
 * Callout shown above a list that was capped server-side, so a partial list
 * never passes for a complete one. Renders nothing when not truncated.
 */
export function TruncationNotice({
  truncated,
  shown,
  total,
  hint = DEFAULT_HINT,
  className,
}: TruncationNoticeProps) {
  if (!truncated) return null;

  const ofTotal = total === undefined ? '' : ` de ${numberFormat.format(total)}`;

  return (
    <div
      role="status"
      className={cn(
        'border-warning/30 bg-warning/10 text-foreground flex items-start gap-3 rounded-lg border p-3 text-sm',
        className,
      )}
    >
      <Info aria-hidden="true" className="text-warning mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Mostrando los primeros {numberFormat.format(shown)}
        {ofTotal} resultados. {hint}
      </p>
    </div>
  );
}
