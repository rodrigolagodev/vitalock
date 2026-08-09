import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthErrorCode } from '@vitalock/shared';

const ERROR_MESSAGES: Record<string, string> = {
  [AuthErrorCode.NO_STAFF_ROW]: 'Cuenta no provisionada. Contactar a soporte.',
  [AuthErrorCode.INACTIVE_STAFF]: 'Cuenta desactivada.',
  [AuthErrorCode.WRONG_ROLE]: 'Esta cuenta no tiene acceso a esta aplicación.',
  [AuthErrorCode.SESSION_EXPIRED]: 'Tu sesión expiró. Iniciá sesión nuevamente.',
  [AuthErrorCode.INVALID_CREDENTIALS]: 'Email o contraseña incorrectos.',
  [AuthErrorCode.NETWORK_ERROR]: 'Error de conexión. Intentá de nuevo.',
};

const FALLBACK_MESSAGE = 'Ocurrió un error inesperado.';

export default function AuthErrorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason') ?? '';
  const message = ERROR_MESSAGES[reason] ?? FALLBACK_MESSAGE;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold">Error de acceso</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Volver al inicio
      </button>
    </div>
  );
}
