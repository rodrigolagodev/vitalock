# Archive Report: Key Lifecycle and Equipment Updates

**Date Archived**: 2026-08-18  
**Change**: `key-lifecycle-equipment-updates`  
**Branch**: `feat/key-lifecycle-equipment-updates`  
**Status**: PASS

## Verdict

The change has passed all verification gates and is closed:

- **Verification Verdict**: PASS (0 CRITICAL, 0 WARNINGS, 0 SUGGESTIONS)
- **All implementation tasks**: 39/39 COMPLETE
- **Test coverage**: 500 Vitest tests PASS; 42/42 SQL scenarios PASS; 5 typechecks PASS
- **Commits delivered**: 16 conventional commits (488c96b → b8bdea2)

## Metrics Summary

| Metric | Count |
|--------|-------|
| SQL test scenarios | 42/42 PASS |
| Vitest tests | 500 PASS |
| TypeScript packages typechecked | 5 PASS |
| Implementation tasks | 39/39 CHECKED |
| Conventional commits | 16 |
| Database migrations | 8 (064–071) |

## Commits Delivered

All 16 commits were authored during this SDD cycle:

1. `488c96b` feat(db): rfid_keys 5-state lifecycle with sync_deactivated_at trigger (W1)
2. `2dd29da` feat(db): equipment_updates snapshot table with RLS and cancel guard (W2/W5)
3. `7dc2f62` feat(db): configure_key_order_item pending_creation + rfid_key_intended_equipment (W3)
4. `7e3dfe6` feat(db): request_key_disable and cancel_key_disable RPCs (W4)
5. `ae01e28` feat(db): resolve_equipment_update atomic RPC (W5b)
6. `31299ce` feat(db): equipment-updates-mdb storage bucket with RLS policies (W7)
7. `681fbad` feat(db): Supabase types regeneration + RPC wrappers for new RPCs (W9)
8. `e4bb58d` feat(admin): key lifecycle 5-state support in keys UI (W10)
9. `c59448c` feat(admin): equipment_update creation and detail flows (W11)
10. `4ed1442` feat(admin): pending keys guardrail badge on equipment view (W12)
11. `30c8781` feat(installer): equipment_update resolve flow (W13)
12. `01bb2d6` chore(sdd): mark W13-W14 tasks complete in tasks.md
13. `2a6966c` feat(db,installer): surface stale-key skips in resolve_equipment_update RPC (W-001)
14. `48dadf9` refactor(db): tighten sync_deactivated_at to design intent (W-002)
15. `05c298c` test(sql): failure-injection test for resolve_equipment_update atomicity (W-003)
16. `b8bdea2` test(installer): signed URL download test for equipment_update detail (W-004)

## Scope Delivered

### New Capabilities
1. **key-lifecycle** — 5-state RFID key status machine (pending_creation, pending_installation, active, pending_disable, disabled); transition edges; key_events audit trail; deactivated_at trigger compatibility.
2. **equipment-updates** — equipment_update task category; snapshot freeze semantics; atomic resolve_equipment_update RPC; .mdb storage bucket; uniqueness and RLS enforcement.

### Modified Capabilities
1. **tickets** — added equipment_update category; added in_progress → cancelled block for equipment_update.
2. **key-configuration** (merged into ordenes-admin) — configure_key_order_item now mints pending_creation (not active); drops key_authorizations INSERT; defers auth mint to equipment_update resolve.
3. **ordenes-admin** — Order Status State Machine: ready_for_pickup deferred until equipment_update resolution (key_authorizations minted there, not at configure time).
4. **equipment-admin** — added PendingKeysGuardrailBadge; added equipment_update task creation entry point.
5. **installer-home** — added equipment_update task in worklist; added task detail resolve flow with stale-key skip warning.

## Non-Goals Honored

From proposal — explicitly OUT OF SCOPE:

- Parse/generate .mdb files (admin uploads pre-built .mdb from Access export)
- Replace Access (tenant workflow still uses Access; Vitalock orders the task)
- Remote sync with equipment (sync logic lives in equipment firmware)
- Data backfill (no historical equipment_update backfill)
- Feature flag (exposed immediately; no toggling)

All non-goals remain unimplemented. They were deferred as separate initiatives.

## Verification Gate Assessment

Per `verify-report.md` (observation #211, 2026-08-18):

- All 4 warnings from previous verify (2026-08-17) were RESOLVED:
  - W-001: resolve_equipment_update now surfaces skipped key IDs in JSONB return; installer UI shows warning
  - W-002: sync_deactivated_at trigger tightened to design intent
  - W-003: failure-injection test added (test_074); atomicity validated
  - W-004: EquipmentUpdateResolveDetail tests added; signed URL download tested
- 1 suggestion from previous verify (S-001: batch-fetch optimization) was RESOLVED:
  - useRfidKeyCodeMap hook added for batch fetching

**Current verification status**: PASS — 0 CRITICAL, 0 WARNINGS, 0 SUGGESTIONS

## Known Gaps and Follow-ups

**Pre-existing issue (unrelated to this change)**:
- Seed data issue from migration 062 (pre-existing installer column restriction error) remains. Tracked separately as issue `20260817000062`. This is a blocker for full seed walkthrough but does not impact the key-lifecycle-equipment-updates change scope.

**No new gaps introduced by this change.**

## Design Decisions Archive

All 8 closed decisions from the proposal were implemented:

1. **Five-state lifecycle** — matches physical workflow; disabled reused as terminal
2. **equipment_update task with frozen snapshot** — batching matches installer trip semantics
3. **Atomic RPC** — reuses resolve_equipment_installation pattern
4. **configure_key_order_item mints pending_creation, auths deferred** — preserves key_authorizations_validate trigger untouched
5. **Installer primary resolver** — admin escape valve via dedicated flow
6. **Release-train concurrency with cancel-and-recreate** — guards against key arrival race
7. **disabled terminal / pending_disable reversible** — naming consistency
8. **rfid_code stays human-facing** — no schema change to identifier

## Specification Merge Summary

Delta specs merged into main OpenSpec catalog:

| Spec | Type | Action | Requirements |
|------|------|--------|--------------|
| key-lifecycle | NEW | Created `openspec/specs/key-lifecycle/spec.md` | 5 requirements (R1–R4 + audit trail) |
| equipment-updates | NEW | Created `openspec/specs/equipment-updates/spec.md` | 6 requirements (snapshot, storage, atomic resolve, uniqueness, admin flow, RLS) |
| tickets | MODIFIED | Added equipment_update category + in_progress cancel block | 2 new requirements added |
| ordenes-admin | MODIFIED | Updated Configure Key Item + Order Status State Machine | 2 requirements substantially modified |
| equipment-admin | MODIFIED | Added guardrail badge + equipment_update creation entry | 2 new requirements added |
| installer-home | MODIFIED | Added equipment_update task worklist + task detail | 2 new requirements added |

## Engram Observation IDs (For Traceability)

All SDD artifacts were persisted to Engram and are traceable:

- Proposal: #205 (`sdd/key-lifecycle-equipment-updates/proposal`)
- Spec: #207 (`sdd/key-lifecycle-equipment-updates/spec`)
- Design: #206 (`sdd/key-lifecycle-equipment-updates/design`)
- Tasks: #208 (`sdd/key-lifecycle-equipment-updates/tasks`)
- Verify-Report: #211 (`sdd/key-lifecycle-equipment-updates/verify-report`)
- Archive-Report: (this observation, saved to `sdd/key-lifecycle-equipment-updates/archive-report`)

## SDD Cycle Complete

This change has been fully planned, specified, designed, implemented, verified, and archived. The SDD cycle is closed. Ready for the next change.
