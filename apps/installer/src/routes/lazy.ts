import { lazy } from 'react';

// Every page is its own chunk (React.lazy + Suspense in main.tsx). LoginPage is
// deliberately NOT here: it is the first paint when logged out.
export const DashboardPage = lazy(() => import('./DashboardPage'));
export const TareasPage = lazy(() => import('./TareasPage'));
export const TaskDetailPage = lazy(() => import('./TaskDetailPage'));
export const HistorialPage = lazy(() => import('./HistorialPage'));
