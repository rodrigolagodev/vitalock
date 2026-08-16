import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
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

function renderApp() {
  return render(
    <ThemeProvider attribute="class">
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<App />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function getHeader(container: HTMLElement): HTMLElement {
  const header = container.querySelector('header');
  expect(header).not.toBeNull();
  return header as HTMLElement;
}

describe('App header brand', () => {
  it('renders the Vitalock wordmark in the header (via logo alt text)', () => {
    const { container } = renderApp();
    const header = getHeader(container);
    expect(within(header).getByAltText('Vitalock')).toBeInTheDocument();
  });

  it('renders both light and dark brand logo variants in the header', () => {
    const { container } = renderApp();
    const header = getHeader(container);
    const brand = header.firstElementChild as HTMLElement;
    const imgs = brand.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    // Light variant is visible by default; dark variant is aria-hidden.
    expect(imgs[0]?.getAttribute('src')).toContain('black');
    expect(imgs[1]?.getAttribute('src')).toContain('white');
    expect(imgs[1]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the theme toggle switch in the header', () => {
    renderApp();
    expect(
      screen.getByRole('switch', { name: 'Cambiar entre tema claro y oscuro' }),
    ).toBeInTheDocument();
  });
});
