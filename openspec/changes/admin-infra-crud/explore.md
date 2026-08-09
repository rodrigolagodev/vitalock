# Exploration: admin-infra-crud

**Change**: admin-infra-crud
**Phase**: explore
**Date**: 2026-08-09
**Persistence**: openspec + engram (`sdd/admin-infra-crud/explore`)

## Summary

Admin app gets its first substantive feature — CRUD for buildings, units, and equipment. Admin app today has session/auth (from auth-session) plus a placeholder route; no real content yet.

## DB State (no migrations needed)

All three entities fully defined with RLS. Admin has `for all` policy on all three. `operations.replace_equipment()` RPC exists for atomic equipment replacement with authorization migration.

### Key constraints

- **ON DELETE RESTRICT everywhere** — physical deletion blocked once children exist; deactivate-only via status field.
- **Equipment immutable fields** (trigger-enforced): `serial_number`, `building_id`, `installed_at`, `replaces_equipment_id`.
- **Dead is terminal** for equipment (auto-closes `key_authorizations` via trigger, affecting installer worklist via Realtime).
- **`units.is_administrative`** has unique-per-building constraint (SQLSTATE 23505).
- **Cross-schema PGRST200** returns from `operations → public` embeds; use direct `.schema('operations')` queries.

## Recommended Approach

**Nested routes** (`/buildings` → `/buildings/:id` with Unidades | Equipos tabs).

```
/buildings                  BuildingsPage — list + create
/buildings/:buildingId      BuildingDetailPage — header + tabs
  → Unidades                UnitsList + Sheet form + deactivate
  → Equipos                 EquipmentList + Sheet form + decommission + replace dialog
```

Layout building is the organizing lens; units and equipment always live inside a building context.

## Affected Files (planned)

- `apps/admin/src/main.tsx` — add Toaster (sonner missing)
- `apps/admin/src/lib/queryKeys.ts`
- `apps/admin/src/hooks/{mapMutationError,useBuildings,useMutateBuilding,useUnits,useMutateUnit,useEquipment,useMutateEquipment}.ts`
- `apps/admin/src/routes/index.tsx` — redirect to /buildings
- `apps/admin/src/routes/buildings/BuildingsPage.tsx`
- `apps/admin/src/routes/buildings/BuildingDetailPage.tsx`
- `apps/admin/src/components/{buildings,units,equipment}/…`

## Risks

1. **PGRST200 cross-schema embed** — mitigated by direct `.schema('operations')` queries.
2. **Immutable equipment fields** — form correctness matters; wrong write → 23514 trigger error.
3. **Dead equipment cascades to installer** — admin should see impact count before confirming.
4. **`is_administrative` 23505** — needs friendly error mapping.
5. **Budget: > 400 lines** — 3 entities + nav shell will overflow → chained PRs (buildings → units → equipment).
6. **Sonner not wired** — silent errors until fixed.

## Questions before proposal

- Q1 — Nav shell scope (full sidebar or minimal?)
- Q2 — Delete vs deactivate (recommendation: deactivate only)
- Q3 — Equipment replacement (recommendation: dedicated dialog using RPC)
- Q4 — `is_administrative` toggle (recommendation: allow post-creation)
- Q5 — Equipment status transitions UI shape
