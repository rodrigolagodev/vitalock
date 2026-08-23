import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import { addLogSink, consoleSink, loadClientEnv } from '@vitalock/shared';
import { createSupabaseClient } from '@vitalock/supabase';
import { AuthProvider, ProtectedRoute, AuthErrorPage } from '@vitalock/shared';

addLogSink(consoleSink);
import App from './App';
import LoginPage from './routes/LoginPage';
import AdministrationsPage from './routes/administraciones/AdministrationsPage';
import AdministrationDetailPage from './routes/administraciones/AdministrationDetailPage';
import BuildingDetailPage from './routes/buildings/BuildingDetailPage';
import OrdenesPage from './routes/ordenes/OrdenesPage';
import OrdenNuevaPage from './routes/ordenes/OrdenNuevaPage';
import OrdenDetailPage from './routes/ordenes/OrdenDetailPage';
import OrdenEditarPage from './routes/ordenes/OrdenEditarPage';
import KeyOrdersPage from './routes/llaves/KeyOrdersPage';
import KeyOrderDetailPage from './routes/llaves/KeyOrderDetailPage';
import KeyOrderNuevaPage from './routes/llaves/KeyOrderNuevaPage';
import KeyOrderEditarPage from './routes/llaves/KeyOrderEditarPage';
import TechnicalOrdersPage from './routes/servicio-tecnico/TechnicalOrdersPage';
import TechnicalOrderDetailPage from './routes/servicio-tecnico/TechnicalOrderDetailPage';
import TechnicalOrderNuevaPage from './routes/servicio-tecnico/TechnicalOrderNuevaPage';
import TechnicalOrderEditarPage from './routes/servicio-tecnico/TechnicalOrderEditarPage';
import TareasPage from './routes/tareas/TareasPage';
import TareaDetailPage from './routes/tareas/TareaDetailPage';
import PersonalPage from './routes/personal/PersonalPage';
import ParticularesPage from './routes/particulares/ParticularesPage';
import StockPage from './routes/stock/StockPage';
import StockDetailPage from './routes/stock/StockDetailPage';
import './styles/globals.css';

const env = loadClientEnv(import.meta.env); // fail-fast at boot
export const supabase = createSupabaseClient({
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider supabase={supabase} expectedRole="admin">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/error" element={<AuthErrorPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<App />}>
                  <Route index element={<Navigate to="/administraciones" replace />} />
                  <Route path="administraciones" element={<AdministrationsPage />} />
                  <Route path="administraciones/:adminId" element={<AdministrationDetailPage />} />
                  <Route path="buildings" element={<Navigate to="/administraciones" replace />} />
                  <Route path="buildings/:buildingId" element={<BuildingDetailPage />} />
                  <Route path="llaves" element={<KeyOrdersPage />} />
                  <Route path="llaves/nueva" element={<KeyOrderNuevaPage />} />
                  <Route path="llaves/:keyOrderId" element={<KeyOrderDetailPage />} />
                  <Route path="llaves/:keyOrderId/editar" element={<KeyOrderEditarPage />} />
                  <Route path="servicio-tecnico" element={<TechnicalOrdersPage />} />
                  <Route path="servicio-tecnico/nueva" element={<TechnicalOrderNuevaPage />} />
                  <Route path="servicio-tecnico/:techOrderId" element={<TechnicalOrderDetailPage />} />
                  <Route path="servicio-tecnico/:techOrderId/editar" element={<TechnicalOrderEditarPage />} />
                  <Route path="ordenes" element={<OrdenesPage />} />
                  <Route path="ordenes/nueva" element={<OrdenNuevaPage />} />
                  <Route path="ordenes/:ordenId" element={<OrdenDetailPage />} />
                  <Route path="ordenes/:ordenId/editar" element={<OrdenEditarPage />} />
                  <Route path="tareas" element={<TareasPage />} />
                  <Route path="tareas/:tareaId" element={<TareaDetailPage />} />
                  <Route path="personal" element={<PersonalPage />} />
                  <Route path="particulares" element={<ParticularesPage />} />
                  <Route path="stock" element={<StockPage />} />
                  <Route path="stock/:productId" element={<StockDetailPage />} />
                </Route>
              </Route>
            </Routes>
            <Toaster richColors position="bottom-center" />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
