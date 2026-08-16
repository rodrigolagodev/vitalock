import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from './AuthProvider';

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export function ProtectedRoute() {
  const { phase, error } = useAuthContext();

  if (phase === 'initializing' || phase === 'fetching_profile') {
    return <FullScreenSpinner />;
  }

  if (phase === 'anonymous' || phase === 'authenticating') {
    return <Navigate to="/login" replace />;
  }

  if (phase === 'error' && error) {
    return <Navigate to={`/error?reason=${error.code}`} replace />;
  }

  return <Outlet />;
}
