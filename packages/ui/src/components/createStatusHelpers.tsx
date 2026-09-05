import { StatusBadge, type StatusTone } from './StatusBadge';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export interface StatusHelpers<T extends string> {
  meta: Record<T, StatusMeta>;
  label: (value: string | null | undefined) => string;
  tone: (value: string | null | undefined) => StatusTone;
  Badge: (props: { status: string | null | undefined }) => JSX.Element;
}

/**
 * Builds label / tone helpers and a StatusBadge component from a single meta
 * table. Guarantees that label and tone can never diverge for the same value,
 * and that the null/unknown fallbacks ('—' and 'neutral') are consistent
 * across every domain.
 *
 * Usage: `export const tareaStatus = createStatusHelpers<TareaStatus>({ ... })`
 * then `<tareaStatus.Badge status={x} />` or `tareaStatus.label(x)`.
 */
export function createStatusHelpers<T extends string>(
  meta: Record<T, StatusMeta>,
): StatusHelpers<T> {
  const label = (value: string | null | undefined): string => {
    if (value == null) return '—';
    return meta[value as T]?.label ?? value;
  };

  const tone = (value: string | null | undefined): StatusTone => {
    if (value == null) return 'neutral';
    return meta[value as T]?.tone ?? 'neutral';
  };

  const Badge = ({ status }: { status: string | null | undefined }) => (
    <StatusBadge tone={tone(status)}>{label(status)}</StatusBadge>
  );

  return { meta, label, tone, Badge };
}
