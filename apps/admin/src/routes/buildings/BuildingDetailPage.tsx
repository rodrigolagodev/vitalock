import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBuilding } from '@/hooks/useBuilding';
import { useAdministration } from '@/hooks/useAdministration';
import { useEquipment } from '@/hooks/useEquipment';
import { useKeys } from '@/hooks/useKeys';
import { EquipmentTable } from '@/components/equipment/EquipmentTable';
import { KeysTable } from '@/components/keys/KeysTable';
import { PageHeader } from '@/components/layout/PageHeader';

export default function BuildingDetailPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [llavesSearch, setLlavesSearch] = useState('');
  const [equiposSearch, setEquiposSearch] = useState('');

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

  const filteredKeys = keys.filter((k) => {
    const q = llavesSearch.trim().toLowerCase();
    if (q === '') return true;
    return (
      k.rfid_code.toLowerCase().includes(q) ||
      k.unit.number.toLowerCase().includes(q)
    );
  });

  const filteredEquipment = equipment.filter((e) => {
    const q = equiposSearch.trim().toLowerCase();
    if (q === '') return true;
    return (
      e.serial_number.toLowerCase().includes(q) ||
      (e.model != null && e.model.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={building.name}
        subtitle={building.address ?? undefined}
        breadcrumbs={[
          { label: 'Administraciones', to: '/administraciones' },
          building.administration_id
            ? {
                label: administration?.company_name ?? 'Administración',
                to: `/administraciones/${building.administration_id}`,
              }
            : { label: 'Sin administración' },
        ]}
      >
        <Badge
          variant={building.status === 'active' ? 'default' : 'secondary'}
          className="shrink-0"
        >
          {building.status === 'active' ? 'Activo' : 'Inactivo'}
        </Badge>
      </PageHeader>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="llaves">Llaves</TabsTrigger>
          <TabsTrigger value="equipos">Equipos</TabsTrigger>
        </TabsList>

        <TabsContent value="llaves" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Llaves</h2>
          <Input
            placeholder="Buscar llaves por código o unidad..."
            value={llavesSearch}
            onChange={(e) => setLlavesSearch(e.target.value)}
            className="max-w-sm"
          />
          <KeysTable buildingId={buildingId} keys={filteredKeys} isFetching={keysFetching} />
        </TabsContent>

        <TabsContent value="equipos" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Equipos</h2>
          <Input
            placeholder="Buscar equipos por serie o modelo..."
            value={equiposSearch}
            onChange={(e) => setEquiposSearch(e.target.value)}
            className="max-w-sm"
          />
          <EquipmentTable buildingId={buildingId} equipment={filteredEquipment} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
