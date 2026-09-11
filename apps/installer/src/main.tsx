import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { DashboardPage, TareasPage, TaskDetailPage, HistorialPage } from './routes/lazy';
import './styles/globals.css';

// Observability. The console sink is always on; the reporting sink is a
// no-op unless VITE_ERROR_REPORTING_ENDPOINT is set (see packages/shared).
addLogSink(consoleSink);
addLogSink(createReportingSink({ app: 'installer' }));

// Field technicians work on flaky connections: retry reads a little harder
// than the admin desktop app before giving up.
const queryClient = createQueryClient({
  app: 'installer',
  defaultOptions: { queries: { retry: 3 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary tag="installer:root" fallback={RootErrorFallback}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthProvider supabase={supabase} expectedRole="installer">
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/error" element={<AuthErrorPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<App />}>
                      <Route
                        element={
                          <RouteBoundaryLayout tag="installer:page" fallback={PageErrorFallback} />
                        }
                      >
                        <Route index element={<DashboardPage />} />
                        <Route path="tareas" element={<TareasPage />} />
                        <Route path="tareas/:id" element={<TaskDetailPage />} />
                        <Route path="historial" element={<HistorialPage />} />
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
