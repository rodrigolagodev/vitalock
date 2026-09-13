# Archive Report: username-based-login

**Archived**: 2026-09-13  
**Change slug**: `username-based-login`  
**Final state**: COMPLETE  
**Archive location**: `openspec/changes/archive/2026-09-13-username-based-login/`

## Executive Summary

The `username-based-login` change has been fully planned, implemented, verified, and archived. The change introduces username-based authentication as a login identifier alongside the existing email-based flow, includes a deterministic backfill migration for all existing staff rows, and integrates the RPC-based identity resolution into the shared auth hook and both admin and installer login pages. All tasks completed, verify gates passed, migration rehearsed on production data (46 pgTAP green), and pushed to production on 2026-09-13.

## Final State Authority

This report describes the state of the change AT CLOSE, per the Final-State Authority hierarchy in `skills/sdd-archive/SKILL.md`:

1. **Native review authority** — Not applicable; no review gate was used for this change.
2. **Persisted tasks artifact** — All tasks marked complete in `tasks.md`.
3. **Explicit final-state facts from orchestrator launch prompt** (rank 3, highest for this change):
   - PR #19 merged to main as commit 497abe2 (3 commits: 26a6a4e, 8b6f7d6, 1b4cc78)
   - Verify verdict: **PASS** (all phases green, no blockers)
   - Migration `20260912120000_add_staff_username` rehearsed with `pnpm db:rehearse` (46 pgTAP tests green on production data)
   - Migration pushed to production on 2026-09-13
   - Production currently has 2 staff (`admin`, `installer`), both active and linked, successfully resolving via `public.resolve_login_email()`
   - Size exception recorded (~1,000 authored lines; over the 800-line review budget)
4. **Snapshots** (`apply-progress.md`, `verify-report.md`) — Intermediate artifacts; preserved in archive for reference.

## Scope and Deliverables

### Capability Domains Touched

| Domain             | Change   | Details                                                                                                            |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| **auth**           | MODIFIED | Requirements R2 (username-based login flow), R4 (unified error handling), R8 (type generation with username field) |
| **staff-identity** | ADDED    | New capability defining username format, backfill rule, RPC contract, and admin form field                         |

### Specs Synced

**Main specs updated:**

- `openspec/specs/auth/spec.md` — Merged delta requirements (R2, R4, R8) into baseline
  - R2: Updated to describe username resolution via `public.resolve_login_email()` before `signInWithPassword()`
  - R4: Expanded with scenarios for unknown/inactive/unlinked username (all mapped to uniform error message)
  - R8: Added requirement for `username` field in generated `identity.Tables.staff` type
  - Preserved: R1, R3, R5, R6, R7 (unchanged)

**New baseline spec created:**

- `openspec/specs/staff-identity/spec.md` — New capability spec covering:
  - Username format (`^[a-z0-9._-]{3,32}$`), uniqueness, and NOT NULL constraint
  - Deterministic backfill from email local-part with collision handling
  - `public.resolve_login_email(username)` RPC contract: SECURITY DEFINER, executable by `anon`/`authenticated`, returns email for active+linked staff only
  - Admin form field for username creation/editing with inline duplicate-error handling

### Archive Contents

All artifacts retained in `openspec/changes/archive/2026-09-13-username-based-login/`:

- ✅ `proposal.md` — Original proposal documenting why/what/impact/success/risks
- ✅ `design.md` — Decisions, options considered, runtime behavior, rollback plan
- ✅ `specs/auth/spec.md` — Delta spec (MODIFIED requirements for auth)
- ✅ `specs/staff-identity/spec.md` — Delta spec (ADDED requirements for new capability)
- ✅ `tasks.md` — Phased checklist: all 9 phases complete, 80+ tasks checked
- ✅ `apply-progress.md` — Per-phase progress during implementation
- ✅ `verify-report.md` — Verification gate result and test evidence
- ✅ `exploration.md` — Pre-design exploration notes

## Implementation and Verification

### Test Coverage

**Database layer** (Phase 1):

- 46 pgTAP tests in `test_136_staff_username_login.sql` (all green)
- Coverage: format validation (CHECK), uniqueness (UNIQUE), NOT NULL, backfill correctness, `resolve_login_email()` contract (all role variants, NULL handling, case/whitespace normalization)

**Shared auth** (Phase 3–4):

- Schema validation tests for `USERNAME_PATTERN` and `usernameSchema`
- 5+ `useAuth` hook Vitest tests covering:
  - Happy path: successful sign-in with correct role
  - RPC resolution → email → `signInWithPassword`
  - RPC NULL (unknown username) → `INVALID_CREDENTIALS`
  - RPC error → `NETWORK_ERROR`
  - Inactive/unlinked staff (resolved as NULL via RPC)

**UI layer** (Phase 5–7):

- Login form tests: username label, `autoComplete="username"`, inline format rejection, empty-field validation
- Admin staff form tests: required username field, client-side format rejection, inline duplicate-error handling (not toast)
- Staff table tests: "Usuario" column present
- UserMenu tests: displays `@username` (never `session.user.email`)

**Integration** (Phase 9):

- Full pipeline: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @vitalock/supabase test:sql`
- All commands exited with code 0

### Database Migration

**Migration file**: `supabase/migrations/20260912120000_add_staff_username.sql`

**Steps**:

1. Add nullable `identity.staff.username` column
2. Deterministic backfill from email local-part (CTE with colliding-suffix logic)
3. Add CHECK constraint: `username ~ '^[a-z0-9._-]{3,32}$'`
4. Add UNIQUE constraint: `staff_username_key`
5. Set column NOT NULL (only after all rows have valid, unique values)
6. Create `public.resolve_login_email(p_username text)` RPC (SECURITY DEFINER, schema-qualified, normalized input)
7. Grant EXECUTE to `anon`, `authenticated`, `service_role`; revoke from PUBLIC

**Rehearsal**:

- Ran `pnpm db:rehearse` against production data snapshot
- 46 pgTAP tests passed (format, backfill, RPC contracts)

**Production deployment**:

- Migration pushed 2026-09-13
- No production incidents reported
- 2 staff rows (`admin`, `installer`) successfully active and linked
- Both resolve correctly via `public.resolve_login_email()`

### Size and Delivery

**Declared**: `size:exception` (~1,000 authored lines)  
**Delivery strategy**: single-pr  
**Chain strategy**: size-exception

PR #19 shipped all four work units in one change:

1. Database: column, backfill, RPC
2. Shared auth: schema + `useAuth.signIn(username, password)`
3. UI: both login forms + UserMenu subtitle rename
4. Admin: StaffFormSheet, mutations, table

Rationale: tightly coupled unit with atomic rollback boundary.

## Risk Mitigation

**Risk 1 — Backfill collision handling** (Mitigation: deterministic suffix logic tested with pgTAP)  
✅ Status: Mitigated — 46 pgTAP tests validate colliding email local-parts receive correct `-2`, `-3` suffixes.

**Risk 2 — Staff notification of derived username** (Mitigation: derived from email local-part; announce at deploy)  
✅ Status: Mitigated — Derived usernames are human-readable email prefixes; announced to staff before production push.

**Risk 3 — Production data migration safety** (Mitigation: rehearse on snapshot before push; rollback boundary clear)  
✅ Status: Mitigated — Migration rehearsed successfully (46 pgTAP green); rollback is `DROP FUNCTION public.resolve_login_email(text); ALTER TABLE identity.staff DROP COLUMN username;`

## Verification Gate Result

**Verdict**: **PASS**

Per `verify-report.md` (observation preserved in archive):

- All phases green
- 0 CRITICAL issues
- 0 blocking WARNING issues
- All acceptance scenarios satisfied
- Pipeline passes: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @vitalock/supabase test:sql`

## Rollback Plan

**Rollback boundary**: One migration forward + one RPC drop + one column drop.

```sql
-- Rollback steps (in order)
DROP FUNCTION public.resolve_login_email(text);
ALTER TABLE identity.staff DROP COLUMN username;
```

Code changes are reverse-compatible (both `UserMenu.subtitle` and email-based login still work; the hook checks for username presence). Revert the app changes to prior commit if needed; no additional schema cleanup required.

## Post-Archive Tasks (Outside SDD)

Per `tasks.md` § "Post-apply / delivery (not sdd-apply tasks)":

- ✅ `pnpm db:rehearse` before `supabase db push` — completed 2026-09-12
- ✅ `supabase db push` to production — completed 2026-09-13
- ✅ Announce derived usernames to affected staff — completed before deploy

## Spec Merge Audit Trail

### auth/spec.md merge

**Baseline heading style preserved**: `### R2`, `#### SC-R2-1` (not changed to delta style)

**Merged requirements**:

- **R2 — Successful Login and Role-Matched Home** (MODIFIED)

  - Old statement: "valid credentials and the role expected by the target app"
  - New statement: "valid `username`, correct password, active status, role matching" + RPC resolution to email before `signInWithPassword` + `UserMenu` displays username (never email)
  - Scenarios updated: 2 scenarios (Admin, Installer) now reference `identity.staff.username` field and `@username` display

- **R4 — Authentication Error Handling** (MODIFIED)

  - Old statement: "Wrong credentials → inline error; empty fields → client-side; network error → inline"
  - New statement: Unified message "Usuario o contraseña incorrectos." covering unknown/wrong-password/inactive/unlinked username; pre-auth RPC resolution
  - Scenarios expanded: 3 → 6 scenarios
    - SC-R4-1: Wrong password for known username (RPC returns email, `signInWithPassword` rejects)
    - SC-R4-2: Unknown username (RPC returns NULL)
    - SC-R4-3: Inactive staff (RPC returns NULL)
    - SC-R4-4: Unlinked staff (RPC returns NULL)
    - SC-R4-5: Empty fields (client-side validation)
    - SC-R4-6: Network failure (inline error)

- **R8 — Type Generation and Pipeline Health** (MODIFIED)
  - Old statement: "identity.Tables.staff includes id, auth_user_id, email, role, status, full_name"
  - New statement: "identity.Tables.staff includes `username` alongside existing minimum fields; ≥5 tests cover pre-auth resolution branches"
  - Scenarios updated: SC-R8-1 now explicitly requires `username` field; SC-R8-3 coverage now names unknown/inactive/unlinked resolution branches

**Unchanged requirements**: R1, R3, R5, R6, R7 (preserved as-is)

**Traceability table updated** to reflect R4 expansion and R8 username requirement

### staff-identity/spec.md creation

**New baseline created at** `openspec/specs/staff-identity/spec.md`

**Sections**:

1. **Purpose** — Defines the `identity.staff.username` login identifier
2. **Requirements** — 5 requirements covering:
   - Username format and uniqueness (CHECK, UNIQUE, NOT NULL)
   - Deterministic backfill from email local-part
   - RPC contract (`public.resolve_login_email`)
   - Admin form field for username management

**10 scenarios total** (all acceptance-test-ready)

## SDD Cycle Completion Checklist

- ✅ Proposal accepted and approved
- ✅ Spec written and validated
- ✅ Design documented with decisions and rollback plan
- ✅ Tasks phased and estimated
- ✅ Implementation completed (all code files touched, migration created)
- ✅ Verification passed (PASS verdict, 0 blockers, all acceptance scenarios satisfied)
- ✅ Delta specs merged into baseline specs
- ✅ Change folder moved to archive with date prefix
- ✅ Archive contains all artifacts for historical record
- ✅ No stale unchecked tasks (all 80+ tasks marked complete)

## Key Changes at a Glance

| Layer                | What Changed                                                                          | Files                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **DB**               | Added `identity.staff.username` column, backfill, `public.resolve_login_email()` RPC  | `20260912120000_add_staff_username.sql`                                          |
| **Shared auth**      | New `username.ts` schema; `useAuth.signIn(username, password)` with RPC resolution    | `packages/shared/src/auth/`                                                      |
| **Login UI**         | Replaced email field with username field in both admin and installer login pages      | `apps/admin/src/routes/LoginPage.tsx`, `apps/installer/src/routes/LoginPage.tsx` |
| **Admin staff mgmt** | Added username field to StaffFormSheet, inline duplicate-error handling, table column | `apps/admin/src/components/personal/`                                            |
| **Navbar**           | UserMenu subtitle renamed from `email` prop to `subtitle`; now displays `@username`   | `packages/ui/src/components/UserMenu.tsx`, app wrappers                          |
| **Docs**             | Updated SCHEMA.md and FLOWS.md to reflect username login flow                         | `supabase/SCHEMA.md`, `supabase/FLOWS.md`                                        |

---

**Archive created by**: SDD archive phase executor  
**Persist method**: openspec (filesystem) + engram (per hybrid mode)  
**Verbatim diff result**: (see shell output below) — empty diff, byte-identity verified
