import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Badge } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  const { data: administration } = useAdministration(
    building?.administration_id ?? '',
  );
  const { data: equipment = [], isFetching: equipmentFetching } = useEquipment(buildingId ?? '');
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
    if (llavesStatus !== 'all' && k.status !== llavesStatus) return false;
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

      {/* Section selector */}
      <RadioGroup
        value={activeTab}
        onValueChange={handleTabChange}
        aria-label="Sección del edificio"
        className="grid w-full grid-cols-2"
      >
        <RadioGroupItem value="llaves" className="text-center">
          Llaves
        </RadioGroupItem>
        <RadioGroupItem value="equipos" className="text-center">
          Equipos
        </RadioGroupItem>
      </RadioGroup>

        {activeTab === 'llaves' && (
          <div className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Llaves</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
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
          <KeysTable buildingId={buildingId} keys={filteredKeys} isFetching={keysFetching} />
        </div>
        )}

        {activeTab === 'equipos' && (
          <div className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Equipos</h2>
          <Input
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
