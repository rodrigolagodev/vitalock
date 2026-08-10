import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdministration } from '@/hooks/useAdministration';
import { useBuildings } from '@/hooks/useBuildings';
import { BuildingsTable } from '@/components/buildings/BuildingsTable';
import { BuildingFormSheet } from '@/components/buildings/BuildingFormSheet';
import { AdministrationFormSheet } from '@/components/administrations/AdministrationFormSheet';
import type { AdministrationRow } from '@/hooks/useAdministrations';

export default function AdministrationDetailPage() {
  const { adminId } = useParams<{ adminId: string }>();
  const [buildingSheetOpen, setBuildingSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

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

  // Cast to AdministrationRow for the edit sheet (compatible superset)
  const administrationForEdit: AdministrationRow = {
    id: administration.id,
    company_name: administration.company_name,
    tax_id: administration.tax_id,
    address: administration.address,
    status: administration.status,
    email: null,
    phone: null,
    notes: null,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Link
              to="/administraciones"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Administraciones
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-bold">{administration.company_name}</h1>
          </div>
          {administration.tax_id && (
            <p className="text-sm text-muted-foreground">CUIT/CUIL: {administration.tax_id}</p>
          )}
          {administration.address && (
            <p className="text-sm text-muted-foreground">{administration.address}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={administration.status === 'active' ? 'default' : 'secondary'}>
            {administration.status === 'active' ? 'Activa' : 'Inactiva'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setEditSheetOpen(true)}>
            Editar
          </Button>
        </div>
      </div>

      {/* Buildings section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edificios</h2>
          <Button size="sm" onClick={() => setBuildingSheetOpen(true)}>
            Nuevo edificio
          </Button>
        </div>
        <BuildingsTable buildings={buildings} isFetching={buildingsFetching} />
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
