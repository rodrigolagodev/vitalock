import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
    username: 'juan.perez',
    role: 'installer',
    status: 'active',
  },
  error: null,
  isLoading: false,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
};

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderApp(initialPath = '/', authOverride: Partial<UseAuthReturn> = {}) {
  return render(
    <ThemeProvider attribute="class">
      <AuthContext.Provider value={{ ...authStub, ...authOverride }}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<div>DASHBOARD</div>} />
              <Route path="tareas" element={<div>TAREAS</div>} />
              <Route path="historial" element={<div>HISTORIAL</div>} />
              <Route path="tareas/:id" element={<div>DETALLE</div>} />
            </Route>
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('App shell — top bar', () => {
  it('renders the Vitalock wordmark in the top bar', () => {
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

  it('clears the notch with the top safe area', () => {
    const { container } = renderApp();
    expect(container.querySelector('header')).toHaveClass('pt-safe-t');
  });

  it('puts an avatar-only user menu in the top bar', () => {
    const { container } = renderApp();
    const header = container.querySelector('header') as HTMLElement;
    const trigger = within(header).getByRole('button', { name: 'Abrir menú de usuario' });
    expect(trigger).toHaveTextContent('JP');
    expect(trigger).not.toHaveTextContent('Juan Perez');
  });

  it('exposes theme toggle and sign-out inside the user menu popover', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(async () => {});
    renderApp('/', { signOut });

    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));
    expect(
      screen.getByRole('switch', { name: 'Cambiar entre tema claro y oscuro' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Salir/ }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('has no hamburger, drawer, sidebar or collapse toggle', () => {
    renderApp();
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle sidebar' })).not.toBeInTheDocument();
  });
});

describe('App shell — tab bar', () => {
  it('renders exactly three tabs in order with the expected routes', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Inicio', '/'],
      ['Tareas', '/tareas'],
      ['Historial', '/historial'],
    ]);
    expect(screen.queryByRole('link', { name: 'Perfil' })).not.toBeInTheDocument();
  });

  it('marks the tab of the current route as active, including nested routes', () => {
    renderApp('/tareas/abc');
    expect(screen.getByRole('link', { name: 'Tareas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('DETALLE')).toBeInTheDocument();
  });

  it('navigates when a tab is tapped', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('link', { name: 'Historial' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/historial');
    expect(screen.getByText('HISTORIAL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('App shell — connectivity banner', () => {
  afterEach(() => setOnline(true));

  it('shows the banner on every route when offline', () => {
    setOnline(false);
    for (const path of ['/', '/tareas', '/historial', '/tareas/abc']) {
      const { unmount } = renderApp(path);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
      unmount();
    }
  });

  it('shows no banner when online and reacts to browser events', () => {
    setOnline(true);
    renderApp('/');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
