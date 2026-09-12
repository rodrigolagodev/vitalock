import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AuthContext } from '@vitalock/shared';
import type { UseAuthReturn } from '@vitalock/shared';
import App from '@/App';

const originalMatchMedia = window.matchMedia;

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  stubMatchMedia(false);
  window.localStorage.removeItem('vitalock-sidebar-collapsed');
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: originalMatchMedia,
  });
});

const authStub: UseAuthReturn = {
  phase: 'authenticated',
  session: {
    user: { email: 'installer@example.com' },
  } as unknown as UseAuthReturn['session'],
  staff: {
    id: 'staff-1',
    auth_user_id: 'auth-1',
    full_name: 'Juan Perez',
    role: 'installer',
    status: 'active',
  },
  error: null,
  isLoading: false,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
};

function renderApp(initialPath = '/') {
  return render(
    <ThemeProvider attribute="class">
      <AuthContext.Provider value={authStub}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<div>DASHBOARD</div>} />
              <Route path="tareas" element={<div>TAREAS</div>} />
              <Route path="historial" element={<div>HISTORIAL</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  );
}

describe('App shell — mobile topbar', () => {
  it('renders the Vitalock wordmark in the mobile topbar', () => {
    const { container } = renderApp();
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByAltText('Vitalock')).toBeInTheDocument();
  });

  it('renders both light and dark brand logo variants', () => {
    const { container } = renderApp();
    const header = container.querySelector('header') as HTMLElement;
    const imgs = header.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    expect(imgs[0]?.getAttribute('src')).toContain('black');
    expect(imgs[1]?.getAttribute('src')).toContain('white');
    expect(imgs[1]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the hamburger trigger that opens the mobile drawer with nav and user menu', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const header = container.querySelector('header') as HTMLElement;
    await user.click(within(header).getByRole('button', { name: 'Abrir menú' }));

    // The drawer repeats the nav tree and pins the user menu to its bottom.
    const drawerLinks = screen.getAllByRole('link', { name: 'Tareas' });
    expect(drawerLinks).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Abrir menú de usuario' })).toHaveLength(2);
    // Backdrop + explicit X button both close the drawer.
    expect(screen.getAllByRole('button', { name: 'Cerrar menú' })).toHaveLength(2);
  });
});

describe('App shell — desktop sidebar', () => {
  it('renders the three primary nav items with the expected routes', () => {
    renderApp();
    const expected = [
      ['Dashboard', '/'],
      ['Tareas', '/tareas'],
      ['Historial', '/historial'],
    ] as const;
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('renders the user menu trigger with initials and name', () => {
    renderApp();
    // "Juan Perez" -> "JP"
    const button = screen.getByRole('button', { name: 'Abrir menú de usuario' });
    expect(button).toHaveTextContent('JP');
    expect(button).toHaveTextContent('Juan Perez');
  });

  it('exposes theme toggle and sign-out inside the user menu popover', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));

    expect(
      screen.getByRole('switch', { name: 'Cambiar entre tema claro y oscuro' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salir/ })).toBeInTheDocument();
  });

  it('expands by default and collapses when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tareas')).not.toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(aside).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Tareas')).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(aside).toHaveAttribute('aria-expanded', 'true');
  });
});
