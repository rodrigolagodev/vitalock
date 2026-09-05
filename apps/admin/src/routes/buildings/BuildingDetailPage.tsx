import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@vitalock/ui';
import { Tabs, TabsList, TabsTrigger } from '@vitalock/ui';
import { ErrorState, NotFoundState, SearchInput, SectionHeading, Skeleton } from '@vitalock/ui';
import { buildingStatus } from '@/lib/status/buildingStatus';
import type { KeyRow } from '@/hooks/useKeys';
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
  const [llavesStatus, setLlavesStatus] = useState<'all' | KeyRow['status']>('all');
  const [equiposSearch, setEquiposSearch] = useState('');

  const activeTab = searchParams.get('tab') ?? 'equipos';

  const { data: building, isLoading, isError } = useBuilding(buildingId ?? '');
  const { data: administration } = useAdministration(building?.administration_id ?? '');
  const { data: equipment = [], isFetching: equipmentFetching } = useEquipment(buildingId ?? '');
  const { data: keys = [], isFetching: keysFetching } = useKeys(buildingId);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  if (!buildingId) {
    return (
      <ErrorState
        message="ID de edificio inválido."
        back={{ label: 'Volver a administraciones', to: '/administraciones' }}
        className="py-24"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || building == null) {
    return isError ? (
      <ErrorState
        message="Error al cargar el edificio."
        back={{ label: 'Volver a administraciones', to: '/administraciones' }}
        className="py-24"
      />
    ) : (
      <NotFoundState
        message="Edificio no encontrado."
        back={{ label: 'Volver a administraciones', to: '/administraciones' }}
      />
    );
  }

  const filteredKeys = keys.filter((k) => {
    if (llavesStatus !== 'all' && k.status !== llavesStatus) return false;
    const q = llavesSearch.trim().toLowerCase();
    if (q === '') return true;
    return k.rfid_code.toLowerCase().includes(q) || k.unit.number.toLowerCase().includes(q);
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
        titleAdornment={<buildingStatus.Badge status={building.status} />}
      />

      {/* Section selector */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2" aria-label="Sección del edificio">
          <TabsTrigger value="llaves">Llaves</TabsTrigger>
          <TabsTrigger value="equipos">Equipos</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'llaves' && (
        <div className="mt-4 space-y-4">
          <SectionHeading title="Llaves" variant="secondary" />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder="Buscar llaves por código o unidad..."
              value={llavesSearch}
              onChange={(e) => setLlavesSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={llavesStatus}
              onValueChange={(v) => setLlavesStatus(v as 'all' | KeyRow['status'])}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="pending_installation">Pendiente instalación</SelectItem>
                <SelectItem value="pending_creation">En creación</SelectItem>
                <SelectItem value="pending_disable">Baja solicitada</SelectItem>
                <SelectItem value="disabled">Dada de baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <KeysTable
            buildingId={buildingId}
            keys={filteredKeys}
            isFetching={keysFetching}
            hasFilters={llavesSearch.trim() !== '' || llavesStatus !== 'all'}
          />
        </div>
      )}

      {activeTab === 'equipos' && (
        <div className="mt-4 space-y-4">
          <SectionHeading title="Equipos" variant="secondary" />
          <SearchInput
            placeholder="Buscar equipos por serie o modelo..."
            value={equiposSearch}
            onChange={(e) => setEquiposSearch(e.target.value)}
            className="max-w-sm"
          />
          <EquipmentTable
            buildingId={buildingId}
            equipment={filteredEquipment}
            isFetching={equipmentFetching}
          />
        </div>
      )}
    </div>
  );
}
