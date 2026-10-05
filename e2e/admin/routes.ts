/**
 * The ten admin list routes with their exact PageHeader titles
 * (apps/admin/src/routes/**). Shared by the navigation and a11y specs. Kept
 * literal on purpose: a renamed page should fail the specs, not silently match
 * a looser pattern.
 */
export const ROUTES: ReadonlyArray<[path: string, heading: string]> = [
  ['/administraciones', 'Administraciones'],
  ['/llaves', 'Órdenes de llaves'],
  ['/llaves/inventario', 'Inventario de llaves'],
  ['/equipos', 'Inventario de equipos'],
  ['/servicio-tecnico', 'Servicio técnico'],
  ['/ordenes', 'Órdenes'],
  ['/tareas', 'Tareas'],
  ['/personal', 'Personal'],
  ['/particulares', 'Particulares'],
  ['/stock', 'Stock'],
];
