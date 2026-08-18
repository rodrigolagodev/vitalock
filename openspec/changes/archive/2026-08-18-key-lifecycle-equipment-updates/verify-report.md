# Verify Report: key-lifecycle-equipment-updates

**Verdict**: PASS
**Date (re-verify)**: 2026-08-18
**Branch**: feat/key-lifecycle-equipment-updates
**Commits verified (re-verify)**: 16 (488c96b → b8bdea2)
**Previous verdict (2026-08-17)**: PASS WITH WARNINGS (4 warnings, 1 suggestion)
**Re-verify scope**: confirm all 4 warnings + 1 suggestion are resolved; spot-check settled gates

---

## Re-verify: Warning/Suggestion Resolution Matrix

| ID | First-run finding | Resolution commit | Status |
|---|---|---|---|
| W-001 | Stale-key skip warning not surfaced in installer UI | `2a6966c` | RESOLVED |
| W-002 | sync_deactivated_at clears too broadly (any non-disabled transition) | `48dadf9` | RESOLVED |
| W-003 | No failure-injection test for resolve_equipment_update atomicity | `05c298c` | RESOLVED |
| W-004 | No Vitest test for signed URL download in EquipmentUpdateResolveDetail | `b8bdea2` | RESOLVED |
| S-001 | Key display showed UUID slice instead of rfid_code | `2a6966c` | RESOLVED |

---

## 1. Warning-Specific Verification

### W-001 — Stale-key skip warning surfaced in installer UI

**Evidence**:
- `supabase/migrations/20260818000072_resolve_equipment_update_v2_return.sql`: DROP + CREATE changes return type from `uuid` to `jsonb` shape `{"ticket_id": <uuid>, "skipped_key_ids": [<uuid>...]}`. Stale keys in both loops are collected into `v_skipped` and returned via `to_jsonb(v_skipped)`.
- `packages/supabase/src/rpc/resolveEquipmentUpdate.ts`: `ResolveEquipmentUpdateResult` interface includes `skipped_key_ids: string[]`. Wrapper normalises to empty array if absent.
- `apps/installer/src/hooks/useResolveEquipmentUpdate.ts`: `onSuccess` reads `result.skipped_key_ids.length`; fires `toast.warning(...)` with count when `> 0`, `toast.success(...)` otherwise.
- `apps/installer/src/hooks/__tests__/useResolveEquipmentUpdate.test.ts`: 6 tests cover: RPC called with correct args, success toast on empty skipped, warning toast on non-empty skipped, skipped_key_ids exposed in mutation result (non-empty and empty), and error surfacing.
- test_072 PASS: 3/3 scenarios — skipped key in JSONB result, empty array when none skipped, regression happy path.

**Verdict**: RESOLVED

---

### W-002 — sync_deactivated_at trigger too broad

**Evidence**:
- `supabase/migrations/20260818000073_rfid_keys_sync_deactivated_at_tighten.sql`: trigger function replaced. UPDATE path now has exactly three branches:
  1. `new.status = 'disabled'` → stamp `deactivated_at`
  2. `old.status = 'pending_disable' AND new.status = 'active'` → clear `deactivated_at`
  3. all other transitions → leave `deactivated_at` unchanged (no-op)
- test_073 PASS: 5/5 scenarios — cancel path clears, disabled path sets, `pending_creation→pending_installation` leaves unchanged, `active→pending_disable` leaves unchanged, non-cancel `pending_installation→active` does NOT clear a pre-existing value.

**Verdict**: RESOLVED

---

### W-003 — No atomicity failure-injection test

**Evidence**:
- `supabase/tests-sql/test_074_resolve_equipment_update_atomicity.sql`: Scenario 1 pre-inserts a conflicting `key_authorization` row (for key1/equipment), then calls `resolve_equipment_update`. The unique constraint fires mid-loop, exception propagates, savepoint rolls back. Assertions verify: key1 remains `pending_installation`, key2 remains `pending_disable`, ticket remains `open`, `key_events` count delta is 0. Scenario 2 is the clean baseline complement.
- test_074 PASS: 2/2 scenarios.

**Verdict**: RESOLVED

---

### W-004 — No Vitest test for signed URL download

**Evidence**:
- `apps/installer/src/components/work/__tests__/EquipmentUpdateResolveDetail.test.tsx`: 5 tests across 2 describe groups.
  - "calls createSignedUrl with the correct path and TTL of 300" — asserts `mockStorageFrom` called with `'equipment-updates-mdb'` and `mockCreateSignedUrl` called with `('task-001/equip.mdb', 300)`. PASS.
  - "creates an anchor element with the signed URL as href" — spies on `document.createElement`, confirms anchor `href` equals the signed URL. PASS.
  - "does nothing when createSignedUrl returns an error" — confirms no anchor click when storage errors. PASS.
  - Plus 2 rfid_code display tests (S-001 complement).

**Verdict**: RESOLVED

---

### S-001 — Key display used UUID slice, not rfid_code

**Evidence**:
- `apps/installer/src/hooks/useRfidKeyCodeMap.ts`: new hook. Given a list of UUID key IDs, batches a `rfid_keys` select for `id, rfid_code`, returns `Map<string, string>`. Stable query key via sorted join. Falls back to empty map while loading.
- `apps/installer/src/components/work/EquipmentUpdateResolveDetail.tsx`: imports `useRfidKeyCodeMap`, builds `allKeyIds` from both snapshot arrays, calls `keyLabel(id)` which does `rfidCodeMap.get(id) ?? id.slice(0, 8) + '…'`. The UUID fallback is still present but only used when the map hasn't resolved.
- EquipmentUpdateResolveDetail.test.tsx: "renders rfid_code instead of UUID slice when codes are loaded" confirms `RFID-ACT-001` and `RFID-DIS-001` are rendered. "falls back to UUID slice when rfid_code lookup returns nothing for a key" confirms `key-uuid…` is rendered for unmapped keys.

**Verdict**: RESOLVED

---

## 2. Test Evidence (re-verify run)

### Typecheck

```
pnpm typecheck — exit 0 (FULL TURBO — all 5 packages cached clean)
- @vitalock/supabase: PASS
- @vitalock/ui: PASS
- @vitalock/shared: PASS
- @vitalock/installer: PASS
- @vitalock/admin: PASS
```

### Vitest

```
pnpm test — exit 0 (FULL TURBO — all packages cached)
- @vitalock/admin: 60 files, 376 tests PASS
- @vitalock/installer: 8 files, 31 tests PASS (up from 7 files / 23 tests in first-run)
  - useResolveEquipmentUpdate.test.ts: 6 tests PASS
  - EquipmentUpdateResolveDetail.test.tsx: 5 tests PASS (NEW)
- @vitalock/ui: 7 files, 71 tests PASS
- @vitalock/shared: 4 files, 22 tests PASS
- Total: 500 tests PASS, 0 FAIL
```

### SQL Migration Tests (psql -f against 127.0.0.1:54322)

| File | Scenarios | Result |
|---|---|---|
| test_064_rfid_keys_status_check.sql | 5 | 5 PASS |
| test_065_key_events_event_type.sql | 3 | 3 PASS |
| test_066_equipment_updates_table.sql | 4 | 4 PASS |
| test_067_tickets_equipment_update_category.sql | 6 | 6 PASS |
| test_068_configure_key_order_item.sql | 3 | 3 PASS |
| test_069_disable_rpcs.sql | 5 | 5 PASS |
| test_070_resolve_equipment_update.sql | 4 | 4 PASS |
| test_071_storage_bucket.sql | 2 | 2 PASS |
| test_072_resolve_equipment_update_v2_return.sql | 3 | 3 PASS (NEW) |
| test_073_sync_deactivated_at_tighten.sql | 5 | 5 PASS (NEW) |
| test_074_resolve_equipment_update_atomicity.sql | 2 | 2 PASS (NEW) |
| **Total** | **42** | **42 PASS** |

---

## 3. Spec Compliance Matrix (delta only — unchanged rows from first run remain PASS)

Changes from first-run:

| Spec | Requirement | Scenario | Status (first) | Status (re-verify) |
|---|---|---|---|---|
| equipment-updates | R3: Signed URL | Signed URL grants temporary download access | WARN (no Vitest test) | PASS |
| equipment-updates | R4: Atomic Resolution | Partial failure causes complete rollback | WARN (no injection test) | PASS |
| equipment-updates | R7: Installer Resolve | Stale-key skip warning surfaced | WARN (not implemented) | PASS |
| installer-home | R2: Stale-key skip warning | UI surfaces skipped key warning | WARN (not implemented) | PASS |

**Full score: 22/22 equipment-updates requirements, 6/6 installer-home requirements — all PASS.**

---

## 4. Design Conformance (delta only)

| Design Item | Status (first) | Status (re-verify) |
|---|---|---|
| sync_deactivated_at: only clears on pending_disable→active | WARN (cleared too broadly) | PASS |
| Stale-key skip warning in installer UI | WARN (not implemented) | PASS |

All other design items remain PASS from first run.

---

## 5. Task-List Conformance

All 39 tasks remain `[x]` — no regression. The 5 fix work units (FIX-1 through FIX-5) landed as additional commits outside the original task numbering, consistent with the scoped-fix apply-progress record.

---

## 6. Issues

**0 CRITICAL — 0 WARNINGS — 0 SUGGESTIONS**

No new findings discovered during re-verify.

---

## 7. Gate Assessment

**Verdict: PASS**

- **0 CRITICAL issues**
- **0 WARNING issues** (all 4 previous warnings resolved)
- **0 SUGGESTIONS** (S-001 resolved)
- 42/42 SQL scenarios PASS (test_064–test_074)
- 500/500 Vitest tests PASS
- 5/5 packages typecheck clean

---

## 8. Ready for Archive?

**Yes — ready for `sdd-archive`.**

All spec requirements are covered by passing tests. No open warnings or suggestions remain. The implementation is complete, tested, and verified.

---

## Appendix: First-Run Report Summary (2026-08-17)

The first verify (commits 488c96b → 01bb2d6, 12 commits) returned PASS WITH WARNINGS:

- **W-001**: resolve_equipment_update returned uuid, not skipped list; installer UI showed generic toast only
- **W-002**: sync_deactivated_at trigger cleared deactivated_at on ANY non-disabled transition (safe no-op, but not aligned with design)
- **W-003**: No synthetic failure-injection test for resolve_equipment_update atomicity
- **W-004**: createSignedUrl in EquipmentUpdateResolveDetail had no Vitest coverage
- **S-001**: Key display in detail component showed UUID slice instead of rfid_code

All 5 were resolved in 4 commits (2a6966c, 48dadf9, 05c298c, b8bdea2) before this re-verify.
