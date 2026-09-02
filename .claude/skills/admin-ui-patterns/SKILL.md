---
name: admin-ui-patterns
description: Recurring UI patterns in the Vitalock admin app (apps/admin). Load when working on a *DetailPage or *Page under apps/admin/src/routes/, or when the prompt references PageHeader, SectionHeading, StatCard, EditableTitle, StatusBadge, titleAdornment, action buttons in a section header, stock-movement-style reference links, category segmented controls, snapshot rows, or "make X section prettier/more consistent" in the admin UI.
---

# admin-ui-patterns

Six patterns already discovered and validated in Vitalock's admin app. Apply them **before** proposing an alternative — an alternative is what caused the last three regressions this file exists to prevent.

## Component sources

| Component               | Path                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `PageHeader`            | `apps/admin/src/components/layout/PageHeader.tsx`                          |
| `EditableTitle`         | `apps/admin/src/components/layout/EditableTitle.tsx`                       |
| `SectionHeading`        | `packages/ui/src/components/patterns/SectionHeading.tsx`                   |
| `StatCard`              | `packages/ui/src/components/patterns/StatCard.tsx` (or nearest equivalent) |
| `StatusBadge` / `Badge` | `packages/ui/src/components/`                                              |
| Reference: full example | `apps/admin/src/routes/stock/StockDetailPage.tsx`                          |

## Pattern 1 — Status badges in `titleAdornment`, not `children`

`PageHeader` has a `titleAdornment` slot that renders **inline with the h1** (`flex items-center gap-3`). Status / category / identity badges go there. `children` is reserved for action buttons on the right side (`flex justify-between`).

```tsx
<PageHeader title="Administración Central" titleAdornment={<StatusBadge status={admin.status} />}>
  <Button variant="outline">Editar</Button>
  <Button>Nuevo edificio</Button>
</PageHeader>
```

**Do not** put the status badge as `children`. That was the pre-refactor layout; it was corrected across `AdministrationDetailPage` and `BuildingDetailPage` and matches the `StockDetailPage` category-badge pattern.

Evidence: memory obs #347, #345.

## Pattern 2 — Editable identity via `EditableTitle`

When the identity field (product name, administration name, etc.) is user-mutable, the edit affordance lives **inline in the h1**, not in a separate edit card:

- `PageHeader.title` accepts `ReactNode`. Pass `<EditableTitle value={name} onSave={handleSave} />` instead of a plain string.
- `EditableTitle` renders a `PenLine` icon button next to the text; click enters edit mode; Enter saves, Escape cancels; Check/X buttons appear during edit.
- Draft syncs with `value` via `useEffect([value, editing])` after mutation invalidates the query.

**Do not** build a separate "Editar" card with `useForm` + `zodResolver` when the only editable field is the identity. Reserve full form cards for multi-field edits.

Evidence: memory obs #345 (StockDetailPage rewrite).

## Pattern 3 — StatCard snapshot row under the header

Detail pages that expose 3–5 numeric snapshots (available / reserved / total / cost, or equivalent) render them as a **single horizontal row of `StatCard`** immediately under the `PageHeader`, above any editable section. The row is a visual summary, not a form.

```tsx
<PageHeader ... />
<div className="grid grid-cols-4 gap-4">
  <StatCard label="Disponible" value={stock.available} />
  <StatCard label="Reservado" value={stock.reserved} />
  <StatCard label="Total"       value={stock.total} />
  <StatCard label="Costo de compra" value={fmtCurrency(stock.cost)} />
</div>
```

Evidence: memory obs #344 (StockDetailPage snapshot row).

## Pattern 4 — Action buttons inside `SectionHeading`, header-size

Detail pages have multiple sections. When a section needs its own actions ("Editar", "Nuevo edificio", "Cargar producto"), they go **as `children` of `SectionHeading`** (or `PageHeader` for header-level actions), side by side, at the **standard header height** — do **not** use `size="sm"`:

- Primary action → default variant (filled).
- Secondary action → `variant="outline"`.

```tsx
<SectionHeading title="Edificios">
  <Button variant="outline">Editar</Button>
  <Button>Nuevo edificio</Button>
</SectionHeading>
```

Evidence: memory obs #348 (AdministrationDetailPage action layout).

## Pattern 5 — Table references-as-links (auto-resolve target)

Table columns that reference another entity (a stock movement's "Referencia" column pointing to the originating task or order) render as **`<Link>`** components with route resolution based on the reference kind:

- `ticket_id` → `/tareas/:ticket_id`
- `order_kind === 'key'` → `/llaves/:order_id`
- `order_kind === 'technical'` → `/servicio-tecnico/:order_id`

When no route is resolvable (orphan or unknown kind), render the label as **plain text**, not a broken link. Do not fall back to a generic `/orders/:id` catch-all — the routing is domain-specific.

Evidence: memory obs #346 (StockMovementsTable references).

## Pattern 6 — Segmented control for finite category enums

Category-like enums with **3–6 values** (`ProductCategory`, ticket category, etc.) render as a **segmented control**, not a `<Select>`. The picker only appears on create; on the detail view the category is a **non-editable identity badge** via `titleAdornment` (see Pattern 1).

Shared field component: `apps/admin/src/components/stock/ProductFormFields.tsx` (or equivalent per domain).

Rule: category is identity, not attribute. Once set at create-time, it does not change through the edit UI. A "llave" cannot become an "equipo" via a category dropdown.

Evidence: memory obs #343 (ProductFormFields segmented control).

## Anti-patterns to reject

- Duplicating a `PageHeader` layout instead of using the shared component.
- Rebuilding a `Badge` locally in `apps/admin/src/components/ui/` — `packages/ui` owns primitives; local re-exports were removed in the Fase D cleanup (memory obs #296).
- Adding a "Download .mdb" button when the firmware-update history table already exposes downloads.
- Adding a duplicate "update history" panel when the main history section already includes updates.
- Any `w-[347px]` or `text-[#a13c22]` — extend the token/preset instead.

## When in doubt

Read `apps/admin/src/routes/stock/StockDetailPage.tsx` end-to-end. It is the canonical example: header with EditableTitle + category badge in titleAdornment, StatCard snapshot row, action buttons in SectionHeading, references-as-links in the StockMovementsTable.
