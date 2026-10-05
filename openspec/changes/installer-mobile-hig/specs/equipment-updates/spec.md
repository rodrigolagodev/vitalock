# Delta for equipment-updates

**Change**: installer-mobile-hig
**Date**: 2026-10-05

`EquipmentUpdateResolveDetail.tsx` is dead code (its only importer is its own test) and is deleted by this change. The history/rollback behaviour it described already lives in `TaskDetailPage` (section "Actualizaciones anteriores"). This delta retargets the requirement at the component that actually renders it; the observable behaviour is unchanged.

## MODIFIED Requirements

### Requirement: Installer UI — Rollback Download Section

`TaskDetailPage`, when it renders an `equipment_update` task (category `update_equipment`), MUST include a collapsible "Actualizaciones anteriores" (or equivalent "Historial del equipo") section that lists all prior `equipment_updates` rows for the SAME equipment (excluding the current open task), each with an MDB download link. No DB write or ticket state change is performed as part of the download — rollback is entirely manual (the installer downloads the `.mdb` and syncs it to the device out-of-band). `EquipmentUpdateResolveDetail` MUST NOT exist in the codebase, and no import or test may reference it.

(Previously: the requirement named `EquipmentUpdateResolveDetail` as the component hosting the section.)

#### Scenario: Only this equipment's updates are listed (RLS-scoped)

- GIVEN the installer is resolving task EU for equipment EQ
- AND equipment EQ has prior updates EU_prev1, EU_prev2
- AND another equipment OTHER_EQ also has updates (not related to EQ)
- WHEN the installer opens `TaskDetailPage` for EU
- THEN the history section lists EU_prev1 and EU_prev2
- AND updates for OTHER_EQ are NOT shown

#### Scenario: Download link opens a signed URL for the historical .mdb

- GIVEN a prior `equipment_updates` row EU_prev with a non-null `mdb_storage_path`
- WHEN the installer clicks the download link for EU_prev in the history section of `TaskDetailPage`
- THEN the browser navigates to (or opens) a signed Supabase Storage URL for `mdb_storage_path`
- AND the installer can retrieve the file

#### Scenario: Rollback is manual — no DB write occurs

- GIVEN the installer clicks the download link for a prior update EU_prev
- THEN no `support.tickets` or `support.equipment_updates` row is modified
- AND no `rfid_keys` status is changed
- AND no `key_order_items` or `key_orders` row is changed

#### Scenario: Dead component is removed

- GIVEN the installer sources are searched
- WHEN `EquipmentUpdateResolveDetail` is looked up (source and tests)
- THEN no file or reference remains
- AND the `TaskDetailPage` tests for the history section pass
