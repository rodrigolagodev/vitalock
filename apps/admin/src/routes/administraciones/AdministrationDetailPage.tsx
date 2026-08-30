import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  ErrorState,
  NotFoundState,
  SearchInput,
  SectionHeading,
  Skeleton,
  StatusBadge,
} from '@vitalock/ui';
import {
  administrationStatusLabel,
  administrationStatusTone,
} from '@/lib/status/administrationStatus';
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
      <ErrorState
        message="ID de administración inválido."
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

  if (isError || administration == null) {
    return isError ? (
      <ErrorState
        message="Error al cargar la administración."
        back={{ label: 'Volver a administraciones', to: '/administraciones' }}
        className="py-24"
      />
    ) : (
      <NotFoundState
        message="Administración no encontrada."
        back={{ label: 'Volver a administraciones', to: '/administraciones' }}
      />
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
        <StatusBadge tone={administrationStatusTone(administration.status)}>
          {administrationStatusLabel(administration.status)}
        </StatusBadge>
        <Button variant="outline" size="sm" onClick={() => setEditSheetOpen(true)}>
          Editar
        </Button>
      </PageHeader>

      {/* Buildings section */}
      <div className="flex flex-col gap-4">
        <SectionHeading title="Edificios" variant="secondary">
          <Button size="sm" onClick={() => setBuildingSheetOpen(true)}>
            Nuevo edificio
          </Button>
        </SectionHeading>
        <SearchInput
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
