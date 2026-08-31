import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import { addLogSink, consoleSink } from '@vitalock/shared';
import { AuthProvider, ProtectedRoute, AuthErrorPage } from '@vitalock/shared';
import { supabase } from './lib/supabase';

addLogSink(consoleSink);
import App from './App';
import DashboardPage from './routes/DashboardPage';
import TareasPage from './routes/TareasPage';
import TaskDetailPage from './routes/TaskDetailPage';
import HistorialPage from './routes/HistorialPage';
import LoginPage from './routes/LoginPage';
import './styles/globals.css';

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
                  <Route index element={<DashboardPage />} />
                  <Route path="tareas" element={<TareasPage />} />
                  <Route path="tareas/:id" element={<TaskDetailPage />} />
                  <Route path="historial" element={<HistorialPage />} />
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
