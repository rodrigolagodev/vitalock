import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBuilding } from '@/hooks/useBuilding';
import { useAdministration } from '@/hooks/useAdministration';
import { useEquipment } from '@/hooks/useEquipment';
import { useKeys } from '@/hooks/useKeys';
import { EquipmentTable } from '@/components/equipment/EquipmentTable';
import { EquipmentFormSheet } from '@/components/equipment/EquipmentFormSheet';
import { KeysTable } from '@/components/keys/KeysTable';

export default function BuildingDetailPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);

  const activeTab = searchParams.get('tab') ?? 'llaves';

  const { data: building, isLoading, isError } = useBuilding(buildingId ?? '');
  const { data: administration, isLoading: adminLoading } = useAdministration(
    building?.administration_id ?? '',
  );
  const { data: equipment = [] } = useEquipment(buildingId ?? '');
  const { data: keys = [], isFetching: keysFetching } = useKeys(buildingId);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  if (!buildingId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">ID de edificio inválido.</p>
        <Link to="/administraciones" className="mt-4 text-sm underline">
          Volver a administraciones
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (isError || building == null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {isError ? 'Error al cargar el edificio.' : 'Edificio no encontrado.'}
        </p>
        <Link to="/administraciones" className="mt-4 text-sm underline">
          Volver a administraciones
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/administraciones"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Administraciones
            </Link>
            <span className="text-muted-foreground">/</span>
            {building.administration_id == null ? (
              <span className="text-sm text-muted-foreground">Sin administración</span>
            ) : adminLoading ? (
              <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
            ) : (
              <Link
                to={`/administraciones/${building.administration_id}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {administration?.company_name ?? 'Administración'}
              </Link>
            )}
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-bold">{building.name}</h1>
          </div>
          {building.address && (
            <p className="text-sm text-muted-foreground">{building.address}</p>
          )}
        </div>
        <Badge
          variant={building.status === 'active' ? 'default' : 'secondary'}
          className="shrink-0"
        >
          {building.status === 'active' ? 'Activo' : 'Inactivo'}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="llaves">Llaves</TabsTrigger>
          <TabsTrigger value="equipos">Equipos</TabsTrigger>
        </TabsList>

        <TabsContent value="llaves" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Llaves</h2>
          <KeysTable buildingId={buildingId} keys={keys} isFetching={keysFetching} />
        </TabsContent>

        <TabsContent value="equipos" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Equipos</h2>
            <Button size="sm" onClick={() => setEquipmentSheetOpen(true)}>
              Nuevo equipo
            </Button>
          </div>
          <EquipmentTable buildingId={buildingId} equipment={equipment} />
          <EquipmentFormSheet
            open={equipmentSheetOpen}
            onOpenChange={setEquipmentSheetOpen}
            buildingId={buildingId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
