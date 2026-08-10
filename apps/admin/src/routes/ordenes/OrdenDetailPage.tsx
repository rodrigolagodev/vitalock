import { useParams } from 'react-router-dom';

/**
 * Placeholder — full implementation in PR#3.
 */
export default function OrdenDetailPage() {
  const { ordenId } = useParams<{ ordenId: string }>();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Detalle de orden</h1>
      <p className="text-sm text-muted-foreground">
        Orden: {ordenId}
      </p>
      <p className="text-xs text-muted-foreground">
        Implementación completa disponible en la próxima versión.
      </p>
    </div>
  );
}
