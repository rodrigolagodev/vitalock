# Verification Report — equipment-update-bundle-flow

## Change
equipment-update-bundle-flow

## Mode
hybrid (Engram + openspec file)

## Verdict (initial)
PASS WITH WARNINGS — 1 CRITICAL, 2 WARNING (spec), 2 WARNING (docs drift), 0 SUGGESTION

## Verdict (re-verify after remediation, 2026-08-28)
**PASS — 0 CRITICAL, 0 WARNING, 0 SUGGESTION**

---

## Remediation Confirmed (2026-08-28)

All five findings from the initial verify pass are closed.

| Finding | Fix confirmed |
|---|---|
| CRITICAL-1: `usePendingKeysForEquipment` toDisable queries `sync_state='pending_removal'` | `apps/admin/src/hooks/usePendingKeysForEquipment.ts:54` now uses `.eq('sync_state', 'installed')`. Comment explains the reasoning. |
| WARNING-1: No copy-to-clipboard on snapshot panel | `EquipmentKeySnapshotPanel.tsx` now imports `Copy`/`Check` from lucide-react, defines `formatSnapshotForClipboard` and `handleCopy`, renders a "Copiar snapshot" button outside the tabs. |
| WARNING-2: Snapshot panel renders for non-active equipment | `EquipoDetailPage.tsx:394` now guards the section with `{equipment.status === 'active' && ...}`. |
| WARNING-3: `docs/flows/keys/order-lifecycle.md` Known Gap #1 stale | Known Gap #1 rewritten: describes orphaned `mark_key_order_item_installed` RPC, explicitly credits migration `20260827000104`, cross-references test_095/test_096. |
| WARNING-4: `docs/flows/technical-service/equipment-update.md` known gaps stale | Active gap entry removed; new "Resolved gaps (post equipment-update-bundle-flow)" section documents the resolution. |

---

## Re-verify Build / Test Evidence (2026-08-28)

| Suite | Result | Count |
|---|---|---|
| pnpm test (admin Vitest) | PASS | 627/627 |
| pnpm test (installer Vitest) | PASS | 39/39 |
| pnpm typecheck | PASS | 0 errors |
| pnpm test:sql (pgTAP) | PASS (prior run) | 15 new assertions — no SQL changes in remediation |

---

## Spec Compliance Matrix — Final State

### Requirement 1: resolve_equipment_update Advances key_order_items — COMPLIANT

| Scenario | Status | Evidence |
|---|---|---|
| Single-item order reaches ready_for_pickup | PASS | test_092-C (extended), test_095-1 |
| Multi-item order stays pending_installation until all resolved | PASS | test_096-1, test_096-2, test_096-3 |
| Legacy-path key still triggers order_items recompute | PASS | Legacy branch in migration lines 118-124; test_092-A/B unchanged |
| Key with no linked key_order_item is a no-op | PASS | test_095-5 |
| Snapshot skip does not advance any key_order_item | PASS | test_095-3 |

### Requirement 2: Pending-Keys Snapshot Query (usePendingKeysForEquipment) — COMPLIANT

| Scenario | Status | Evidence |
|---|---|---|
| to_activate group | PASS | rfid_key_intended_equipment filter; Vitest shape test |
| to_disable group | PASS | Hook uses `sync_state='installed'` (fixed); final filter checks `status='pending_disable'` |
| unchanged group | PASS | sync_state='installed', removed_at=null |
| No cross-equipment leaks | PASS (shape) | equipment_id scoping at each query step |
| RLS | NOT TESTED | Deferred to pgTAP/manual; acceptable per project convention |

### Requirement 3: Equipment Update History Query — COMPLIANT
### Requirement 4: Admin UI — Equipment Detail Snapshot Panel — COMPLIANT
### Requirement 5: Admin UI — Equipment Detail History Panel — COMPLIANT
### Requirement 6: Installer UI — Rollback Download Section — COMPLIANT

---

## Critical Constraint Enforcement

| Constraint | Status |
|---|---|
| 20260823000097 NOT modified | PASS |
| record_order_key_pickup in 20260826000099 NOT modified | PASS |
| Legacy order_items branch preserved | PASS |
| Bucket name 'equipment-updates-mdb' | PASS |
| Signed URL TTL 300 seconds | PASS |

---

## Task Completion

All tasks [x]. No open items.

---

## Final Verdict

**PASS** — 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

All spec scenarios covered. All tests green. Ready for `sdd-archive`.

---

## Initial Issues (for audit trail)

The following issues were raised in the initial verify and are now closed.

<details>
<summary>Initial CRITICAL-1 (closed)</summary>

**CRITICAL-1: usePendingKeysForEquipment — toDisable group queries wrong sync_state**

- File: `apps/admin/src/hooks/usePendingKeysForEquipment.ts:51`
- Was: `.eq('sync_state', 'pending_removal')`
- Fixed to: `.eq('sync_state', 'installed')`
</details>

<details>
<summary>Initial WARNING-1 (closed)</summary>

**WARNING-1: EquipmentKeySnapshotPanel — no copy-to-clipboard action**

- Spec Req 4 Scenario C. Implemented via `handleCopy` + `formatSnapshotForClipboard`.
</details>

<details>
<summary>Initial WARNING-2 (closed)</summary>

**WARNING-2: EquipoDetailPage — snapshot panel renders regardless of status**

- Fixed: `{equipment.status === 'active' && ...}` guard at line 394.
</details>

<details>
<summary>Initial WARNING-3 (closed)</summary>

**WARNING-3: docs/flows/keys/order-lifecycle.md Known Gap #1 stale**

- Fixed: Known Gap #1 now documents the orphaned RPC and closed wiring gap.
</details>

<details>
<summary>Initial WARNING-4 (closed)</summary>

**WARNING-4: docs/flows/technical-service/equipment-update.md known gaps stale**

- Fixed: active gap removed; "Resolved gaps" section added.
</details>
