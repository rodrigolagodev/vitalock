import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/utils';

export interface TooltipProps {
  /** Label rendered inside the tooltip on hover. */
  content: string;
  /** The trigger element that shows the tooltip on hover. */
  children: React.ReactNode;
  /** Preferred side relative to the trigger. Defaults to `"right"`. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Offset in px from the trigger edge. */
  sideOffset?: number;
  /** Hover delay in ms before the tooltip appears. */
  delayDuration?: number;
  className?: string;
}

/**
 * Radix-based Tooltip primitive for collapsed sidebar nav item hover labels.
 * Portals to the document body with a z-index above sidebar overlays.
 */
export function Tooltip({
  content,
  children,
  side = 'right',
  sideOffset = 8,
  delayDuration = 300,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            className={cn(
              'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
