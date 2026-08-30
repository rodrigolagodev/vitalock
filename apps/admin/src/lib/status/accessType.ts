/**
 * Canonical access-type keys for equipment.
 *
 * Two pages historically diverged on the stored keys and their human labels:
 * - EquipoDetailPage used:  service, peatonal, cochera, terraza, amenities, other
 * - TareaDetailPage used:   principal, servicio, cochera, puerta_2, puerta_3,
 *                           puerta_4, otro
 *
 * This module unifies them into ONE canonical set. Synonym mapping:
 * - `service` ≡ `servicio` ≡ `peatonal` ≡ `principal`  → all render "Servicio"
 *   (principal access / service access — the same concept).
 * - `other` ≡ `otro`                                   → both render "Otro".
 * - `cochera` (`cochera`) is already shared.
 * - `terraza`, `amenities` are kept for historical data (no canonical alias).
 *
 * Canonical set (VALUES stored going forward): service, cochera, puerta_2,
 * puerta_3, puerta_4, otro. `accessTypeLabel` maps EVERY known legacy synonym
 * to its canonical label so no stored key ever falls back to the raw value.
 */
export const ACCESS_TYPE_LABELS: Record<string, string> = {
  // canonical
  service: 'Servicio',
  cochera: 'Cochera',
  puerta_2: 'Puerta 2',
  puerta_3: 'Puerta 3',
  puerta_4: 'Puerta 4',
  otro: 'Otro',
  // legacy synonyms → canonical labels
  principal: 'Servicio',
  servicios: 'Servicio',
  servicio: 'Servicio',
  peatonal: 'Servicio',
  other: 'Otro',
  // kept legacy values
  terraza: 'Terraza',
  amenities: 'Amenities',
};

/** Canonical access-type keys that should be used when storing new values. */
export const ACCESS_TYPE_KEYS = [
  'service',
  'cochera',
  'puerta_2',
  'puerta_3',
  'puerta_4',
  'otro',
] as const;

export function accessTypeLabel(key: string | null | undefined): string {
  if (key == null) return '—';
  return ACCESS_TYPE_LABELS[key] ?? key;
}
