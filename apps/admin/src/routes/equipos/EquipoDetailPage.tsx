import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, StatusBadge } from '@vitalock/ui';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Section } from '@/components/common/Section';
import { useEquipmentById } from '@/hooks/useEquipmentById';
import { equipmentStatusLabel, equipmentStatusTone } from '@/lib/status/equipmentStatus';
import { keyOrderStatusLabel } from '@/lib/status/keyOrderStatus';
import { keyItemStatusLabel } from '@/lib/status/keyItemStatus';
import { accessTypeLabel } from '@/lib/status/accessType';
import { EquipmentKeySnapshotPanel } from '@/components/equipment/EquipmentKeySnapshotPanel';
import { EquipmentUpdateHistoryPanel } from '@/components/equipment/EquipmentUpdateHistoryPanel';

const ITEM_TYPE_LABEL: Record<string, string> = {
  install_equipment: 'Instalación',
  replace_equipment: 'Reemplazo',
  maintain_equipment: 'Mantenimiento',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function EquipmentLabel({ serial_number, model }: { serial_number: string; model: string | null }) {
  return (
    <>
      {model ? `${model} · ` : ''}
      <span className="font-mono">{serial_number}</span>
    </>
  );
}

export default function EquipoDetailPage() {
  const { equipoId } = useParams<{ equipoId: string }>();
  const { data: equipment, isLoading, isError } = useEquipmentById(equipoId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  if (isError || !equipment) {
    return (
      <ErrorState message="No se pudo cargar la información del equipo." className="gap-4 py-16">
        <Button asChild variant="outline" size="sm">
          <Link to="/equipos">Volver al inventario</Link>
        </Button>
      </ErrorState>
    );
  }

  // Synthesize timeline events since there's no equipment_events table.
  const timeline: { label: string; at: string; tone: string; note?: string }[] = [
    { label: 'Instalado', at: equipment.installed_at, tone: 'bg-primary' },
  ];
  for (const o of equipment.associated_orders) {
    if (o.item_status === 'completed') {
      timeline.push({
        label: `Orden ${o.order_number} — ${ITEM_TYPE_LABEL[o.item_type] ?? o.item_type} completada`,
        at: o.order_created_at,
        tone: 'bg-primary',
      });
    }
  }
  if (equipment.replaced_by) {
    timeline.push({
      label: `Reemplazado por ${equipment.replaced_by.model ?? equipment.replaced_by.serial_number}`,
      at: equipment.decommissioned_at ?? equipment.installed_at,
      tone: 'bg-muted-foreground',
    });
  }
  if (equipment.decommissioned_at) {
    timeline.push({
      label: 'Dado de baja',
      at: equipment.decommissioned_at,
      tone: 'bg-destructive',
      note: equipment.decommission_reason ?? undefined,
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={equipment.model ?? 'Equipo'}
        breadcrumbs={[
          { label: 'Inventario de equipos', to: '/equipos' },
          { label: equipment.model ?? equipment.serial_number },
        ]}
        titleAdornment={
          <StatusBadge tone={equipmentStatusTone(equipment.status)}>
            {equipmentStatusLabel(equipment.status)}
          </StatusBadge>
        }
        subtitle={<span className="font-mono">{equipment.serial_number}</span>}
      />

      {equipment.status === 'maintenance' && (
        <p className="bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning rounded px-3 py-2 text-sm">
          Este equipo está en mantenimiento.
        </p>
      )}

      {/* 2-column grid on desktop, single column on mobile */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Ubicación">
          <Row
            label="Administración"
            value={
              equipment.building?.administration ? (
                <Link
                  to={`/administraciones/${equipment.building.administration.id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {equipment.building.administration.company_name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <Row
            label="Edificio"
            value={
              equipment.building ? (
                <Link
                  to={`/buildings/${equipment.building.id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {equipment.building.name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <Row label="Descripción" value={equipment.description} />
          {equipment.access_type && (
            <Row label="Tipo de acceso" value={accessTypeLabel(equipment.access_type)} />
          )}
        </Section>

        {(equipment.replaces || equipment.replaced_by) && (
          <Section title="Cadena de reemplazos">
            {equipment.replaces && (
              <Row
                label="Reemplaza a"
                value={
                  <Link
                    to={`/equipos/${equipment.replaces.id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    <EquipmentLabel
                      serial_number={equipment.replaces.serial_number}
                      model={equipment.replaces.model}
                    />
                  </Link>
                }
              />
            )}
            {equipment.replaced_by && (
              <Row
                label="Reemplazado por"
                value={
                  <Link
                    to={`/equipos/${equipment.replaced_by.id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    <EquipmentLabel
                      serial_number={equipment.replaced_by.serial_number}
                      model={equipment.replaced_by.model}
                    />
                  </Link>
                }
              />
            )}
          </Section>
        )}

        <Section title="Historial">
          <div className="flex flex-col gap-3 text-sm">
            {timeline.map((e, i) => (
              <div key={`${e.label}-${i}`} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{e.label}</span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(e.at)}</span>
                  </div>
                  {e.note && (
                    <p className="text-muted-foreground whitespace-pre-wrap text-xs">{e.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Llaves autorizadas">
        {(() => {
          const activeKeys = equipment.authorized_keys.filter(
            (k) => k.sync_state === 'installed' && k.removed_at === null,
          );
          if (activeKeys.length === 0) {
            return <EmptyState message="No hay llaves activas en este equipo." />;
          }
          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                      <th className="pb-2 pr-4 font-medium">RFID</th>
                      <th className="pb-2 pr-4 font-medium">Unidad</th>
                      <th className="pb-2 font-medium">Instalada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeKeys.slice(0, 10).map((k) => (
                      <tr key={k.authorization_id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">
                          <Link
                            to={`/llaves/inventario/${k.key_id}`}
                            className="text-primary font-mono underline-offset-2 hover:underline"
                          >
                            {k.rfid_code}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{k.unit_number ?? '—'}</td>
                        <td className="text-muted-foreground py-2">
                          {formatDateTime(k.installed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {equipment.building && (
                <div className="pt-2 text-right">
                  <Link
                    to={{
                      pathname: '/llaves/inventario',
                      search: new URLSearchParams({
                        ...(equipment.building.administration
                          ? { adminId: equipment.building.administration.id }
                          : {}),
                        buildingId: equipment.building.id,
                        equipmentId: equipment.id,
                      }).toString(),
                    }}
                    className="text-primary text-sm underline-offset-2 hover:underline"
                  >
                    Ver todas ({activeKeys.length}) en el inventario →
                  </Link>
                </div>
              )}
            </>
          );
        })()}
      </Section>

      <Section title="Órdenes técnicas asociadas">
        {equipment.associated_orders.length === 0 ? (
          <EmptyState message="No hay órdenes técnicas vinculadas a este equipo." />
        ) : (
          <ul className="flex flex-col gap-3">
            {equipment.associated_orders.map((o) => (
              <li
                key={`${o.technical_order_id}-${o.role}`}
                className="border-border/60 flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    to={`/servicio-tecnico/${o.technical_order_id}`}
                    className="text-primary font-medium underline-offset-2 hover:underline"
                  >
                    {o.order_number}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(o.order_created_at)}
                  </span>
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                  <span>
                    Tipo: {ITEM_TYPE_LABEL[o.item_type] ?? o.item_type}
                    {o.role === 'replacement' ? ' (como reemplazo)' : ''}
                  </span>
                  <span>·</span>
                  <span>Orden: {keyOrderStatusLabel(o.order_status)}</span>
                  <span>·</span>
                  <span>Ítem: {keyItemStatusLabel(o.item_status)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {equipment.status === 'active' && (
        <Section title="Llaves pendientes de actualización">
          <EquipmentKeySnapshotPanel
            equipmentId={equipment.id}
            buildingId={equipment.building?.id}
            administrationId={equipment.building?.administration?.id}
          />
        </Section>
      )}

      <Section title="Historial de actualizaciones de firmware">
        <EquipmentUpdateHistoryPanel equipmentId={equipment.id} />
      </Section>

      {equipment.notes && (
        <Section title="Notas">
          <p className="whitespace-pre-wrap text-sm">{equipment.notes}</p>
        </Section>
      )}
    </div>
  );
}
