import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, ClipboardList, PackagePlus, RefreshCcw, Wrench } from 'lucide-react';
import { createStatusHelpers } from '@vitalock/ui';

/** Work-order / task status. Labels are FEMININE because they qualify "la tarea". */
export type TareaStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export const tareaStatus = createStatusHelpers<TareaStatus>({
  open: { label: 'Pendiente', tone: 'neutral' },
  in_progress: { label: 'En curso', tone: 'warning' },
  resolved: { label: 'Finalizada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
});

/**
 * Human label for a ticket category; unknown categories fall back to "Tarea".
 * Promoted from `TareasTable.tsx`'s local `CATEGORY_LABELS` const (mirrors
 * installer's `apps/installer/src/lib/status/tareaStatus.ts` shape — same 4
 * category keys, `Record<string, string>` so this module stays independent
 * of `TareaRow`). Label text is admin's own pre-existing copy, unchanged.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  install_equipment: 'Instalación de equipo',
  replace_equipment: 'Cambio de equipo',
  update_equipment: 'Actualización de equipo',
  maintain_equipment: 'Mantenimiento',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Tarea';
}

/**
 * Decorative icon for a ticket category — always paired with a text label
 * (the "Categoría" field or `categoryLabel` elsewhere), so the icon itself
 * carries no separate accessible name (render with `aria-hidden="true"`).
 * Same 4 icon choices as installer's `tareaStatus.ts`.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  install_equipment: PackagePlus,
  replace_equipment: ArrowLeftRight,
  update_equipment: RefreshCcw,
  maintain_equipment: Wrench,
};

export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? ClipboardList;
}
