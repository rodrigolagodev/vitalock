# Manual Verification — ui-foundations-hig

Date: 2026-10-05. Admin dev server pointed at the local Supabase stack, signed in as the seeded admin, viewport 1440×900.

| Check                                               | Theme | Result                                                                                                                                     |
| --------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/administraciones` list + StatCards + search input | dark  | Pass. Input border is visible; muted subtitle and StatCard labels are legible; primary only on the active nav item and the primary action. |
| `/servicio-tecnico` list + filters                  | light | Pass. Muted text is legible on `content` and `card`; input and dashed filter borders are visible; no saturated hover surfaces.             |

Not covered here, and left to reviewer spot-checks:

- Keyboard focus rings on the Sidebar toggle, the UserMenu trigger and the Select item.
- Reduced motion under the OS setting.

Both are asserted by unit tests (`Sidebar`, `UserMenu`, `select`, `tokens.test.ts` reduced-motion block).

Local data is empty, so dense tables and status badges were not exercised visually. The contrast table in `tokens.test.ts` covers the badge pairs.
