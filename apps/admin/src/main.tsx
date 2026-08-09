import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { loadClientEnv } from '@vitalock/shared';
import { createSupabaseClient } from '@vitalock/supabase';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import App from './App';
import LoginPage from './routes/LoginPage';
import AuthErrorPage from './routes/AuthErrorPage';
import BuildingsPage from './routes/buildings/BuildingsPage';
import BuildingDetailPage from './routes/buildings/BuildingDetailPage';
import './styles/globals.css';

const env = loadClientEnv(import.meta.env); // fail-fast at boot
export const supabase = createSupabaseClient({
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider supabase={supabase}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/error" element={<AuthErrorPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<App />}>
                <Route index element={<Navigate to="/buildings" replace />} />
                <Route path="buildings" element={<BuildingsPage />} />
                <Route path="buildings/:buildingId" element={<BuildingDetailPage />} />
              </Route>
            </Route>
          </Routes>
          <Toaster richColors position="bottom-center" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
