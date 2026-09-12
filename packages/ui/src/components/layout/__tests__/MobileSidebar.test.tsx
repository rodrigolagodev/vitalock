import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { MobileSidebar, NavItem } from '@vitalock/ui';

function renderDrawer() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <MobileSidebar footer={<div data-testid="footer">footer</div>}>
        <NavItem label="Ir a B" to="/b" />
      </MobileSidebar>
      <Routes>
        <Route path="/a" element={<p>page A</p>} />
        <Route path="/b" element={<p>page B</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The overlay button comes first in DOM order; the X button inside the aside is second. */
function closeControls() {
  const buttons = screen.getAllByRole('button', { name: 'Cerrar menú' });
  expect(buttons).toHaveLength(2);
  return { overlay: buttons[0] as HTMLElement, closeButton: buttons[1] as HTMLElement };
}

describe('MobileSidebar', () => {
  it('starts closed with only the hamburger trigger', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a B' })).not.toBeInTheDocument();
  });

  it('opens the drawer with nav children and footer, without a logo header', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('link', { name: 'Ir a B' })).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('closes from the close button and from the overlay', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(closeControls().closeButton);
    expect(screen.queryByRole('link', { name: 'Ir a B' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(closeControls().overlay);
    expect(screen.queryByRole('link', { name: 'Ir a B' })).not.toBeInTheDocument();
  });

  it('auto-closes when the location changes', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(screen.getByRole('link', { name: 'Ir a B' }));
    expect(screen.getByText('page B')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a B' })).not.toBeInTheDocument();
  });
});
