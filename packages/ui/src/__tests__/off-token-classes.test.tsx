import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import {
  FilterBar,
  MobileSidebar,
  SearchInput,
  Sidebar,
  Textarea,
  Topbar,
  UserMenu,
} from '@vitalock/ui';

/** No arbitrary px values: every size comes from the Tailwind scale or a token. */
function expectNoArbitraryPx(el: Element) {
  expect(el.className).not.toMatch(/\[-?\d+px\]/);
}

const logo = { lightSrc: '/l.svg', darkSrc: '/d.svg', alt: 'Acme' };

describe('layout components use scale and token classes (no arbitrary px)', () => {
  it('Sidebar is w-60 expanded and w-16 collapsed', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <Sidebar logo={logo}>{null}</Sidebar>
      </MemoryRouter>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside).toHaveClass('w-60');
    expectNoArbitraryPx(aside);

    rerender(
      <MemoryRouter>
        <Sidebar logo={logo} collapsed>
          {null}
        </Sidebar>
      </MemoryRouter>,
    );
    const collapsed = container.querySelector('aside') as HTMLElement;
    expect(collapsed).toHaveClass('w-16');
    expect(collapsed).not.toHaveClass('w-60');
    expectNoArbitraryPx(collapsed);
  });

  it('MobileSidebar drawer is w-72', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <MobileSidebar>{null}</MobileSidebar>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside).toHaveClass('w-72');
    expectNoArbitraryPx(aside);
  });

  it('UserMenu popover is w-60', async () => {
    const user = userEvent.setup();
    render(<UserMenu name="Ana Alvarez" onSignOut={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));
    const content = document.querySelector('[data-radix-popper-content-wrapper] > *') as Element;
    expect(content).toHaveClass('w-60');
    expectNoArbitraryPx(content);
  });

  it('Topbar is h-topbar with an h-8 divider', () => {
    const { container } = render(<Topbar avatar="AA" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveClass('h-topbar');
    expectNoArbitraryPx(bar);
    const divider = screen.getByTestId('topbar-divider');
    expect(divider).toHaveClass('h-8');
    expectNoArbitraryPx(divider);
  });

  it('SearchInput lg is w-96', () => {
    render(<SearchInput size="lg" placeholder="Buscar..." />);
    const input = screen.getByPlaceholderText('Buscar...');
    expect(input).toHaveClass('w-96');
    expectNoArbitraryPx(input);
  });

  it('FilterBar.Search is sm:w-56 lg:w-64', () => {
    render(
      <FilterBar>
        <FilterBar.Search placeholder="Buscar..." value="" onChange={() => undefined} />
      </FilterBar>,
    );
    const input = screen.getByPlaceholderText('Buscar...');
    expect(input).toHaveClass('sm:w-56', 'lg:w-64');
    expectNoArbitraryPx(input);
  });

  it('Textarea min height is min-h-20', () => {
    render(<Textarea placeholder="t" />);
    const area = screen.getByPlaceholderText('t');
    expect(area).toHaveClass('min-h-20');
    expectNoArbitraryPx(area);
  });
});
