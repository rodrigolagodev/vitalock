import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthErrorCode } from './types';
import type { AuthPhase, AuthState, UseAuthReturn } from './types';

afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(phase: AuthPhase, error: AuthState['error'] = null) {
  const value: UseAuthReturn = {
    phase,
    error,
    session: null,
    staff: null,
    isLoading: false,
    signIn: async () => {},
    signOut: async () => {},
    refresh: async () => {},
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<LocationProbe />} />
          <Route path="/error" element={<LocationProbe />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<p>contenido privado</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it.each<AuthPhase>(['initializing', 'fetching_profile'])(
    'shows a spinner and not the page while %s',
    (phase) => {
      const { container } = renderAt(phase);
      expect(screen.queryByText('contenido privado')).toBeNull();
      expect(screen.queryByTestId('location')).toBeNull();
      expect(container.querySelector('.animate-spin')).not.toBeNull();
    },
  );

  it.each<AuthPhase>(['anonymous', 'authenticating'])('redirects to /login when %s', (phase) => {
    renderAt(phase);
    expect(screen.getByTestId('location').textContent).toBe('/login');
    expect(screen.queryByText('contenido privado')).toBeNull();
  });

  it('redirects to /error with the error code as reason', () => {
    renderAt('error', { code: AuthErrorCode.INACTIVE_STAFF, message: 'Cuenta desactivada.' });
    expect(screen.getByTestId('location').textContent).toBe('/error?reason=inactive_staff');
  });

  it('renders the protected page when authenticated', () => {
    renderAt('authenticated');
    expect(screen.getByText('contenido privado')).not.toBeNull();
  });
});
