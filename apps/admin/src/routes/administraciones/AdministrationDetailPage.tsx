import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Badge } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { useAdministration } from '@/hooks/useAdministration';
import { useBuildings } from '@/hooks/useBuildings';
import { BuildingsTable } from '@/components/buildings/BuildingsTable';
import { BuildingFormSheet } from '@/components/buildings/BuildingFormSheet';
import { AdministrationFormSheet } from '@/components/administrations/AdministrationFormSheet';
import { PageHeader } from '@/components/layout/PageHeader';
import type { AdministrationRow } from '@/hooks/useAdministrations';

export default function AdministrationDetailPage() {
  const { adminId } = useParams<{ adminId: string }>();
  const [buildingSheetOpen, setBuildingSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState('');

  const { data: administration, isLoading, isError } = useAdministration(adminId ?? '');
  const { data: buildings = [], isFetching: buildingsFetching } = useBuildings({
    administrationId: adminId,
  });

  if (!adminId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">ID de administración inválido.</p>
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

  if (isError || administration == null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {isError ? 'Error al cargar la administración.' : 'Administración no encontrada.'}
        </p>
        <Link to="/administraciones" className="mt-4 text-sm underline">
          Volver a administraciones
        </Link>
      </div>
    );
  }

  // Pass through all fields from useAdministration to the edit sheet;
  // its shape is a superset-compatible AdministrationRow.
  const administrationForEdit: AdministrationRow = administration;

  const subtitleParts: string[] = [];
  if (administration.tax_id) {
    subtitleParts.push(`CUIT/CUIL: ${administration.tax_id}`);
  }
  if (administration.address) {
    subtitleParts.push(administration.address);
  }
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined;

  const filteredBuildings = buildings.filter((b) => {
    const q = buildingSearch.trim().toLowerCase();
    if (q === '') return true;
    return (
      b.name.toLowerCase().includes(q) ||
      (b.address != null && b.address.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={administration.company_name}
        subtitle={subtitle}
        breadcrumbs={[{ label: 'Administraciones', to: '/administraciones' }]}
      >
        <Badge variant={administration.status === 'active' ? 'default' : 'secondary'}>
          {administration.status === 'active' ? 'Activa' : 'Inactiva'}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => setEditSheetOpen(true)}>
          Editar
        </Button>
      </PageHeader>

      {/* Buildings section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edificios</h2>
          <Button size="sm" onClick={() => setBuildingSheetOpen(true)}>
            Nuevo edificio
          </Button>
        </div>
        <Input
          placeholder="Buscar edificios por nombre o dirección..."
          value={buildingSearch}
          onChange={(e) => setBuildingSearch(e.target.value)}
          className="max-w-sm"
        />
        <BuildingsTable buildings={filteredBuildings} isFetching={buildingsFetching} />
      </div>

      {/* Edit administration sheet */}
      <AdministrationFormSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        administration={administrationForEdit}
      />

      {/* Create building sheet — administrationId pre-fills and hides Select */}
      <BuildingFormSheet
        open={buildingSheetOpen}
        onOpenChange={setBuildingSheetOpen}
        administrationId={adminId}
      />
    </div>
  );
}
