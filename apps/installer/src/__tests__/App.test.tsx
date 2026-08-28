import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('renders the user avatar button with initials in the topbar', () => {
    const { container } = renderApp();
    const header = container.querySelector('header') as HTMLElement;
    // "Juan Perez" -> "JP"
    const button = within(header).getByRole('button', {
      name: 'Abrir menú de usuario',
    });
    expect(button).toHaveTextContent('JP');
  });
});

describe('App shell — bottom navigation (mobile)', () => {
  it('renders the three primary nav items', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByText('Dashboard')).toBeInTheDocument();
    expect(within(nav).getByText('Tareas')).toBeInTheDocument();
    expect(within(nav).getByText('Historial')).toBeInTheDocument();
  });

  it('nav items link to the expected routes', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const links = within(nav).getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/tareas', '/historial']);
  });
});
