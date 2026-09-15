import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

// Card has no interaction state of its own (unlike Dialog/Popover), so it is
// a plain composable div — no Radix primitive. `interactive` adds the
// hover/focus-visible affordance for cards that act as a navigation target
// (see DataCardList's stretched-link title).
//
// Uses `--muted` (neutral), not `--accent` (a vivid brand color paired
// elsewhere with `accent-foreground` text, e.g. Button/NavItem): a Card's
// hover wash sits behind several independently-colored children (muted
// labels, the title, status badges) that can't all be swapped to a single
// foreground color, so the hover background must stay neutral or those
// children lose contrast against it — table.tsx's row hover uses the same
// `hover:bg-muted/50` for the same reason.
const cardVariants = cva('rounded-xl border bg-card text-card-foreground shadow-sm', {
  variants: {
    variant: {
      default: '',
      interactive:
        'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-start justify-between gap-3 p-4', className)}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('min-w-0 truncate text-sm font-medium leading-none', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

// Fixed anatomical slot for header-right content (e.g. a status Badge),
// instead of appending it ad hoc to the title.
const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('shrink-0', className)} {...props} />
  ),
);
CardAction.displayName = 'CardAction';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-2 px-4 pb-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 border-t px-4 py-3', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardAction, CardContent, CardFooter, cardVariants };
