import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { Badge, type BadgeProps } from './badge';

/**
 * Semantic tones for status pills. One shared palette across every table so
 * all status columns render with the same color logic and format:
 *
 * - `neutral` — sin iniciar / inactivo / pendiente / facturado (slate)
 * - `info` — listo para accionar: listo para retirar, tarea abierta (blue)
 * - `brand` — confirmado / configurado (indigo)
 * - `warning` — en proceso / mantenimiento (amber)
 * - `success` — activo / completado / resuelto (green)
 * - `danger` — cancelado / dado de baja (red)
 *
 * Every tone's text color clears WCAG 1.4.3 (>=4.5:1) against the white
 * `--card` background — see `globals.css` for the measured contrast ratios.
 * `neutral` renders via the dedicated `--status-neutral-foreground` token,
 * not the app-wide `--muted-foreground` (which stays lighter for
 * non-status secondary text).
 */
export type StatusTone = 'neutral' | 'info' | 'brand' | 'warning' | 'success' | 'danger';

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-transparent bg-muted text-status-neutral',
  info: 'border-transparent bg-info/10 text-info',
  brand: 'border-transparent bg-brand-500/10 text-brand-600 dark:text-brand-300',
  warning: 'border-transparent bg-warning/10 text-warning',
  success: 'border-transparent bg-success/10 text-success',
  danger: 'border-transparent bg-destructive/10 text-destructive',
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  tone?: StatusTone;
  /**
   * Optional icon rendered before the label. Status must never be
   * color-only (WCAG 1.4.1); pass this whenever a domain's `StatusMeta`
   * declares one so the tone doesn't rely on color alone.
   */
  icon?: LucideIcon;
}

export function StatusBadge({
  tone = 'neutral',
  icon: Icon,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 text-xs', STATUS_TONE_CLASSES[tone], className)}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </Badge>
  );
}
