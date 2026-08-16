import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthErrorCode } from './types';
import { useAuthContext } from './AuthProvider';

const ERROR_MESSAGES: Record<string, string> = {
  [AuthErrorCode.NO_STAFF_ROW]: 'Cuenta no provisionada. Contactar a soporte.',
  [AuthErrorCode.INACTIVE_STAFF]: 'Cuenta desactivada.',
  [AuthErrorCode.WRONG_ROLE]: 'Esta cuenta no tiene acceso a esta aplicación.',
  [AuthErrorCode.SESSION_EXPIRED]: 'Tu sesión expiró. Iniciá sesión nuevamente.',
  [AuthErrorCode.INVALID_CREDENTIALS]: 'Email o contraseña incorrectos.',
  [AuthErrorCode.NETWORK_ERROR]: 'Error de conexión. Intentá de nuevo.',
};

const FALLBACK_MESSAGE = 'Ocurrió un error inesperado.';

export function AuthErrorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuthContext();
  const reason = searchParams.get('reason') ?? '';
  const message = ERROR_MESSAGES[reason] ?? FALLBACK_MESSAGE;
  // Network failures keep the session alive (no signOut), so offer a retry
  // that re-fetches the profile instead of forcing a fresh login.
  const isNetworkError = reason === AuthErrorCode.NETWORK_ERROR;

  const handleRetry = () => {
    void refresh().then(() => navigate('/', { replace: true }));
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold">Error de acceso</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <button
        type="button"
        onClick={isNetworkError ? handleRetry : () => navigate('/login')}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {isNetworkError ? 'Reintentar' : 'Volver al inicio'}
      </button>
    </div>
  );
}
