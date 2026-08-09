import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useBuildings } from '@/hooks/useBuildings';
import { BuildingFormSheet } from '@/components/buildings/BuildingFormSheet';
import { BuildingsTable } from '@/components/buildings/BuildingsTable';

export default function BuildingsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: buildings = [], isLoading, isError } = useBuildings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Cargando edificios...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar los edificios. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edificios</h1>
        <Button onClick={() => setCreateOpen(true)}>Nuevo edificio</Button>
      </div>

      <BuildingsTable buildings={buildings} />

      <BuildingFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
