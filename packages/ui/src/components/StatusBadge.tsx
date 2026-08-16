import * as React from "react"

import { cn } from "../lib/utils"
import { Badge, type BadgeProps } from "./badge"

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
 */
export type StatusTone =
  | "neutral"
  | "info"
  | "brand"
  | "warning"
  | "success"
  | "danger"

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-transparent bg-muted text-muted-foreground",
  info: "border-transparent bg-info/10 text-info",
  brand: "border-transparent bg-brand-500/10 text-brand-600 dark:text-brand-300",
  warning: "border-transparent bg-warning/10 text-warning",
  success: "border-transparent bg-success/10 text-success",
  danger: "border-transparent bg-destructive/10 text-destructive",
}

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  tone?: StatusTone
}

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[12px]", STATUS_TONE_CLASSES[tone], className)}
      {...props}
    />
  )
}
