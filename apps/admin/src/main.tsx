import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import {
  addLogSink,
  consoleSink,
  createReportingSink,
  createQueryClient,
  AppErrorBoundary,
  RouteBoundaryLayout,
  AuthProvider,
  ProtectedRoute,
  AuthErrorPage,
} from '@vitalock/shared';
import { supabase } from './lib/supabase';
import App from './App';
import {
  PageFallback,
  PageErrorFallback,
  RootErrorFallback,
} from './components/common/BoundaryFallbacks';
import LoginPage from './routes/LoginPage';
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
import './styles/globals.css';

// Observability. The console sink is always on; the reporting sink is a
// no-op unless VITE_ERROR_REPORTING_ENDPOINT is set (see packages/shared).
addLogSink(consoleSink);
addLogSink(createReportingSink({ app: 'admin' }));

const queryClient = createQueryClient({ app: 'admin' });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary tag="admin:root" fallback={RootErrorFallback}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthProvider supabase={supabase} expectedRole="admin">
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/error" element={<AuthErrorPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<App />}>
                      <Route
                        element={
                          <RouteBoundaryLayout tag="admin:page" fallback={PageErrorFallback} />
                        }
                      >
                        <Route index element={<Navigate to="/administraciones" replace />} />
                        <Route path="administraciones" element={<AdministrationsPage />} />
                        <Route
                          path="administraciones/:adminId"
                          element={<AdministrationDetailPage />}
                        />
                        <Route
                          path="buildings"
                          element={<Navigate to="/administraciones" replace />}
                        />
                        <Route path="buildings/:buildingId" element={<BuildingDetailPage />} />
                        <Route path="llaves" element={<KeyOrdersPage />} />
                        <Route path="llaves/inventario" element={<InventarioPage />} />
                        <Route path="llaves/inventario/:keyId" element={<KeyDetailPage />} />
                        <Route path="llaves/nueva" element={<KeyOrderNuevaPage />} />
                        <Route path="llaves/:keyOrderId" element={<KeyOrderDetailPage />} />
                        <Route path="llaves/:keyOrderId/editar" element={<KeyOrderEditarPage />} />
                        <Route path="equipos" element={<EquiposPage />} />
                        <Route path="equipos/:equipoId" element={<EquipoDetailPage />} />
                        <Route path="servicio-tecnico" element={<TechnicalOrdersPage />} />
                        <Route
                          path="servicio-tecnico/nueva"
                          element={<TechnicalOrderNuevaPage />}
                        />
                        <Route
                          path="servicio-tecnico/:techOrderId"
                          element={<TechnicalOrderDetailPage />}
                        />
                        <Route
                          path="servicio-tecnico/:techOrderId/editar"
                          element={<TechnicalOrderEditarPage />}
                        />
                        <Route path="ordenes" element={<HistorialPage />} />
                        <Route path="historial" element={<Navigate to="/ordenes" replace />} />
                        <Route path="tareas" element={<TareasPage />} />
                        <Route path="tareas/:tareaId" element={<TareaDetailPage />} />
                        <Route path="personal" element={<PersonalPage />} />
                        <Route path="particulares" element={<ParticularesPage />} />
                        <Route path="stock" element={<StockPage />} />
                        <Route path="stock/:productId" element={<StockDetailPage />} />
                      </Route>
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
              <Toaster richColors position="bottom-center" />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
