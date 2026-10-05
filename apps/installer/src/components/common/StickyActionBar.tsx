import type { ReactNode } from 'react';

/** Id of the hint line; point `aria-describedby` of the bar's buttons at it. */
export const ACTION_BAR_HINT_ID = 'action-bar-hint';

interface StickyActionBarProps {
  /** Action buttons, typically one full-width `size="lg"` button. */
  children: ReactNode;
  /** Visible helper text above the actions, e.g. why they are disabled. */
  hint?: string;
}

/**
 * Thumb-reach action bar: sticks to the bottom of the scrolling main area,
 * right above the tab bar (which already consumes the safe-area inset, so
 * this adds none). Render it as the last child of the page.
 */
export function StickyActionBar({ children, hint }: StickyActionBarProps) {
  return (
    <div
      data-action-bar
      className="bg-card/90 sticky bottom-0 -mx-4 flex flex-col gap-2 border-t px-4 py-3 backdrop-blur"
    >
      {hint && (
        <p id={ACTION_BAR_HINT_ID} className="text-footnote text-muted-foreground text-center">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}
