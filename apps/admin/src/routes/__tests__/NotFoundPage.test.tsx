import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotFoundPage from '../NotFoundPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/known" element={<p>página conocida</p>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotFoundPage (catch-all route)', () => {
  it('renders for an unknown path with a link back home', () => {
    renderAt('/no/existe');
    expect(screen.getByText('Página no encontrada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      '/administraciones',
    );
  });

  it('does not shadow a known route', () => {
    renderAt('/known');
    expect(screen.getByText('página conocida')).toBeInTheDocument();
    expect(screen.queryByText('Página no encontrada.')).not.toBeInTheDocument();
  });
});
