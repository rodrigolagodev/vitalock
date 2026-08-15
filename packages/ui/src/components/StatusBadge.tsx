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
  neutral: "border-transparent bg-[#f1f5f9] text-[#475569]",
  info: "border-transparent bg-[#dbeafe] text-[#1d4ed8]",
  brand: "border-transparent bg-[#e0e7ff] text-[#4338ca]",
  warning: "border-transparent bg-[#fef3c7] text-[#92400e]",
  success: "border-transparent bg-[rgba(209,250,229,0.5)] text-[#059691]",
  danger: "border-transparent bg-[#fee2e2] text-[#b91c1c]",
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
