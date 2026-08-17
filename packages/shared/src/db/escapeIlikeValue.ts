/**
 * Escapes a user-provided string for safe interpolation into a PostgREST
 * `.ilike.<pattern>` filter — especially when that filter is embedded inside
 * `.or(...)` where commas and parentheses would break the syntax.
 *
 * Two layers:
 *  1. Strip PostgREST filter delimiters (`,`, `(`, `)`, `"`, `*`) — a text
 *     search box has no legitimate use for them, and leaving them in lets a
 *     crafted input inject extra filter clauses.
 *  2. Escape SQL LIKE metacharacters (`\`, `%`, `_`) so the user's literal
 *     characters match themselves instead of acting as wildcards.
 */
export function escapeIlikeValue(value: string): string {
  return value
    .replace(/[,()"*]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
