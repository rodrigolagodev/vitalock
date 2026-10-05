import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RouteBoundaryLayout, ProtectedRoute, AuthErrorPage } from '@vitalock/shared';
import App from './App';
import {
  PageErrorFallback,
  SuspenseOutlet,
  RouteErrorFallback,
} from './components/common/BoundaryFallbacks';
import LoginPage from './routes/LoginPage';
import NotFoundPage from './routes/NotFoundPage';
import {
  AdministrationsPage,
  AdministrationDetailPage,
  BuildingDetailPage,
  KeyOrdersPage,
  InventarioPage,
  KeyDetailPage,
  KeyOrderDetailPage,
  KeyOrderNuevaPage,
  KeyOrderEditarPage,
  TechnicalOrdersPage,
  TechnicalOrderDetailPage,
  TechnicalOrderNuevaPage,
  TechnicalOrderEditarPage,
  EquiposPage,
  EquipoDetailPage,
  HistorialPage,
  TareasPage,
  TareaDetailPage,
  PersonalPage,
  ParticularesPage,
  StockPage,
  StockDetailPage,
} from './routes/lazy';

/**
 * The admin route table. A data router (not `<BrowserRouter>`) is required so
 * `useBlocker` can guard navigation away from dirty forms.
 */
export const routes: RouteObject[] = [
  {
    element: <SuspenseOutlet />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'error', element: <AuthErrorPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <App />,
            children: [
              {
                element: <RouteBoundaryLayout tag="admin:page" fallback={PageErrorFallback} />,
                children: [
                  { index: true, element: <Navigate to="/administraciones" replace /> },
                  { path: 'administraciones', element: <AdministrationsPage /> },
                  { path: 'administraciones/:adminId', element: <AdministrationDetailPage /> },
                  { path: 'buildings', element: <Navigate to="/administraciones" replace /> },
                  { path: 'buildings/:buildingId', element: <BuildingDetailPage /> },
                  { path: 'llaves', element: <KeyOrdersPage /> },
                  { path: 'llaves/inventario', element: <InventarioPage /> },
                  { path: 'llaves/inventario/:keyId', element: <KeyDetailPage /> },
                  { path: 'llaves/nueva', element: <KeyOrderNuevaPage /> },
                  { path: 'llaves/:keyOrderId', element: <KeyOrderDetailPage /> },
                  { path: 'llaves/:keyOrderId/editar', element: <KeyOrderEditarPage /> },
                  { path: 'equipos', element: <EquiposPage /> },
                  { path: 'equipos/:equipoId', element: <EquipoDetailPage /> },
                  { path: 'servicio-tecnico', element: <TechnicalOrdersPage /> },
                  { path: 'servicio-tecnico/nueva', element: <TechnicalOrderNuevaPage /> },
                  { path: 'servicio-tecnico/:techOrderId', element: <TechnicalOrderDetailPage /> },
                  {
                    path: 'servicio-tecnico/:techOrderId/editar',
                    element: <TechnicalOrderEditarPage />,
                  },
                  { path: 'ordenes', element: <HistorialPage /> },
                  { path: 'historial', element: <Navigate to="/ordenes" replace /> },
                  { path: 'tareas', element: <TareasPage /> },
                  { path: 'tareas/:tareaId', element: <TareaDetailPage /> },
                  { path: 'personal', element: <PersonalPage /> },
                  { path: 'particulares', element: <ParticularesPage /> },
                  { path: 'stock', element: <StockPage /> },
                  { path: 'stock/:productId', element: <StockDetailPage /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export function createAdminRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
  });
}
