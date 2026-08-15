/**
 * Category labels for the technical-order detail tables (TechnicalItemsTable
 * and OrderTareasTable). Shared here because both tables render the same
 * human-readable category names and fall back to the raw value when unknown.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
  key_configuration: 'Configuración de llave',
  equipment_installation: 'Instalación de equipo',
};
