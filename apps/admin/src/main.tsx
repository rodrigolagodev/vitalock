import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import {
  addLogSink,
  consoleSink,
  createReportingSink,
  errorReportingSink,
  initErrorReporting,
  loadClientEnv,
  createQueryClient,
  createSessionExpiredHandler,
  registerGlobalErrorHandlers,
  AppErrorBoundary,
  AuthProvider,
} from '@vitalock/shared';
import { supabase } from './lib/supabase';
import { RootErrorFallback } from './components/common/BoundaryFallbacks';
import { createAdminRouter } from './router';
import './styles/globals.css';

// Observability. The console sink is always on; the endpoint sink is a no-op
// unless VITE_ERROR_REPORTING_ENDPOINT is set, and Sentry is a no-op unless
// VITE_SENTRY_DSN is set — the SDK chunk is only fetched in that case.
// See docs/runbooks/error-reporting.md.
const env = loadClientEnv(import.meta.env);
void initErrorReporting({
  dsn: env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: env.VITE_RELEASE,
  app: 'admin',
});
addLogSink(consoleSink);
addLogSink(createReportingSink({ app: 'admin' }));
addLogSink(errorReportingSink);
// Errors outside React rendering (event handlers, un-awaited promises).
registerGlobalErrorHandlers('admin:global');

// A 401 / expired JWT anywhere in the query cache signs out and lands on
// /error?reason=session_expired (once per page load, never from /login|/error).
const handleSessionExpired = createSessionExpiredHandler({
  signOut: () => supabase.auth.signOut({ scope: 'local' }),
  basePath: import.meta.env.BASE_URL,
});

const queryClient = createQueryClient({ app: 'admin', onAuthError: handleSessionExpired });

const router = createAdminRouter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary tag="admin:root" fallback={RootErrorFallback}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <AuthProvider supabase={supabase} expectedRole="admin">
            <RouterProvider router={router} />
            <Toaster richColors position="bottom-center" />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
