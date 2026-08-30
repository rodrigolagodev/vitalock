import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface NotFoundStateProps {
  message: string;
  /** Optional back link rendered under the message. */
  back?: { label: string; to: string };
  className?: string;
}

export function NotFoundState({ message, back, className }: NotFoundStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-24 text-center',
        className,
      )}
    >
      <p className="text-lg font-medium text-muted-foreground">{message}</p>
      {back ? (
        <Link to={back.to} className="mt-4 text-sm underline">
          {back.label}
        </Link>
      ) : null}
    </div>
  );
}