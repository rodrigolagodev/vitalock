import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet, SheetContent, SheetTitle } from '@vitalock/ui';

describe('Sheet bottom presentation', () => {
  it('renders a decorative grabber and a bottom safe-area spacer', () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>Detalle</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Detalle' });
    const grabber = dialog.querySelector('[data-sheet-grabber]');
    expect(grabber).not.toBeNull();
    expect(grabber).toHaveAttribute('aria-hidden', 'true');
    expect(dialog.querySelector('[data-sheet-safe-area]')).toHaveClass('h-safe-b');
  });

  it('anchors to the bottom with rounded top corners and a capped, scrollable height', () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>Detalle</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog')).toHaveClass(
      'bottom-0',
      'inset-x-0',
      'rounded-t-sheet',
      'max-h-sheet',
      'overflow-y-auto',
    );
  });

  it('keeps one Cerrar button that closes the sheet', async () => {
    const user = userEvent.setup();
    function Harness() {
      return (
        <Sheet defaultOpen>
          <SheetContent side="bottom">
            <SheetTitle>Detalle</SheetTitle>
          </SheetContent>
        </Sheet>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves the other sides without grabber, spacer or rounded top', () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>Detalle</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-sheet-grabber]')).toBeNull();
    expect(dialog.querySelector('[data-sheet-safe-area]')).toBeNull();
    expect(dialog).not.toHaveClass('rounded-t-sheet');
  });
});
