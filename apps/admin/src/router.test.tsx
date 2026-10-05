import { describe, it, expect } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { routes } from './router';

const leafOf = (path: string) => {
  const matches = matchRoutes(routes, path);
  return matches?.[matches.length - 1];
};

describe('admin route table', () => {
  it.each([
    '/login',
    '/error',
    '/administraciones',
    '/administraciones/456',
    '/buildings/123',
    '/llaves',
    '/llaves/inventario',
    '/llaves/inventario/k1',
    '/llaves/nueva',
    '/llaves/ko1',
    '/llaves/ko1/editar',
    '/equipos',
    '/equipos/e1',
    '/servicio-tecnico',
    '/servicio-tecnico/nueva',
    '/servicio-tecnico/t1',
    '/servicio-tecnico/t1/editar',
    '/ordenes',
    '/tareas',
    '/tareas/t1',
    '/personal',
    '/particulares',
    '/stock',
    '/stock/p1',
  ])('resolves %s to a real page (not the catch-all)', (path) => {
    const leaf = leafOf(path);
    expect(leaf).toBeDefined();
    expect(leaf?.route.path).not.toBe('*');
  });

  it('keeps the dynamic params', () => {
    expect(leafOf('/administraciones/456')?.params).toEqual({ adminId: '456' });
    expect(leafOf('/buildings/123')?.params).toEqual({ buildingId: '123' });
    expect(leafOf('/llaves/ko1/editar')?.params).toEqual({ keyOrderId: 'ko1' });
  });

  it.each(['/', '/buildings', '/historial'])('%s is a redirect route', (path) => {
    const leaf = leafOf(path);
    expect(leaf).toBeDefined();
    expect(leaf?.route.element).toBeDefined();
    expect(leaf?.route.path === '*').toBe(false);
  });

  it('falls back to the not-found page for unknown paths', () => {
    expect(leafOf('/no/existe')?.route.path).toBe('*');
  });

  it('wraps everything in a root route with an error element', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]?.errorElement).toBeDefined();
  });
});
