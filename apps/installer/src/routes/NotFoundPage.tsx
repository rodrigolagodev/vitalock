import { NotFoundState } from '@vitalock/ui';

/** Catch-all (`path="*"`) page, rendered inside the shell for signed-in users. */
export default function NotFoundPage() {
  return (
    <NotFoundState message="Página no encontrada." back={{ label: 'Volver al inicio', to: '/' }} />
  );
}
