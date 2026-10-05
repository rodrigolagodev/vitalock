# Manual Verification — ui-components-hig

Date: 2026-10-05. Admin dev server on the local Supabase stack, seeded admin, 1440×900, light theme.

| Check                                   | Route                               | Result                                                                                                                                                             |
| --------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page title vs section heading hierarchy | `/servicio-tecnico/nueva`           | Pass. H1 (`text-title-1`, 28px) is larger than the section headings "Cliente", "Ítems", "Notas" (`text-title-3`, 18px). The inversion from the audit (M1) is gone. |
| Control heights align                   | `/stock`                            | Pass. The "Cargar producto" button, the search input and the category filter share the 44px control height.                                                        |
| Cards                                   | `/stock`, `/servicio-tecnico/nueva` | Pass. Containers are on `rounded-container` with a hairline border and no resting shadow.                                                                          |
| StatCard                                | `/stock`                            | Pass. Label on the callout step, value on title-2.                                                                                                                 |
| Breadcrumb chevron                      | `/servicio-tecnico/nueva`           | Pass. The chevron is sized to the crumb text.                                                                                                                      |

Local data is empty, so these could not be checked visually:

- the IconButton row actions (their 44px hit area is asserted by class);
- the EquipoDetail and KeyDetail Card + SectionHeading migration (covered by the new page tests).
