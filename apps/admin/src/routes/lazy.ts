import { lazy } from 'react';

// Every page is its own chunk (React.lazy + Suspense in main.tsx). LoginPage is
// deliberately NOT here: it is the first paint for an unauthenticated user and
// must not wait on a second request.
export const AdministrationsPage = lazy(() => import('./administraciones/AdministrationsPage'));
export const AdministrationDetailPage = lazy(
  () => import('./administraciones/AdministrationDetailPage'),
);
export const BuildingDetailPage = lazy(() => import('./buildings/BuildingDetailPage'));
export const KeyOrdersPage = lazy(() => import('./llaves/KeyOrdersPage'));
export const InventarioPage = lazy(() => import('./llaves/InventarioPage'));
export const KeyDetailPage = lazy(() => import('./llaves/KeyDetailPage'));
export const KeyOrderDetailPage = lazy(() => import('./llaves/KeyOrderDetailPage'));
export const KeyOrderNuevaPage = lazy(() => import('./llaves/KeyOrderNuevaPage'));
export const KeyOrderEditarPage = lazy(() => import('./llaves/KeyOrderEditarPage'));
export const TechnicalOrdersPage = lazy(() => import('./servicio-tecnico/TechnicalOrdersPage'));
export const TechnicalOrderDetailPage = lazy(
  () => import('./servicio-tecnico/TechnicalOrderDetailPage'),
);
export const TechnicalOrderNuevaPage = lazy(
  () => import('./servicio-tecnico/TechnicalOrderNuevaPage'),
);
export const TechnicalOrderEditarPage = lazy(
  () => import('./servicio-tecnico/TechnicalOrderEditarPage'),
);
export const EquiposPage = lazy(() => import('./equipos/EquiposPage'));
export const EquipoDetailPage = lazy(() => import('./equipos/EquipoDetailPage'));
export const HistorialPage = lazy(() => import('./historial/HistorialPage'));
export const TareasPage = lazy(() => import('./tareas/TareasPage'));
export const TareaDetailPage = lazy(() => import('./tareas/TareaDetailPage'));
export const PersonalPage = lazy(() => import('./personal/PersonalPage'));
export const ParticularesPage = lazy(() => import('./particulares/ParticularesPage'));
export const StockPage = lazy(() => import('./stock/StockPage'));
export const StockDetailPage = lazy(() => import('./stock/StockDetailPage'));
