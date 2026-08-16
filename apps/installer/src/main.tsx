import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import { loadClientEnv } from '@vitalock/shared';
import { createSupabaseClient } from '@vitalock/supabase';
import { AuthProvider, ProtectedRoute, AuthErrorPage } from '@vitalock/shared';
import App from './App';
import IndexRoute from './routes/index';
import LoginPage from './routes/LoginPage';
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
          <AuthProvider supabase={supabase} expectedRole="installer">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/error" element={<AuthErrorPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<App />}>
                  <Route index element={<IndexRoute />} />
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
