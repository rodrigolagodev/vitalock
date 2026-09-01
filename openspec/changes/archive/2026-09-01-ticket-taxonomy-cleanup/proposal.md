# Proposal: ticket-taxonomy-cleanup

## Why

The `support.tickets.category` taxonomy accreted ad-hoc over multiple features and now carries seven values with three different naming rules mixed together: bare verbs (`maintenance`, `installation`), object-first phrases (`equipment_installation`, `equipment_replacement`, `equipment_update`), and dead placeholders (`key_configuration`, `key_installation`). The inconsistency has already cost us:

1. **Semantic duplicates.** `installation` and `equipment_installation` both create equipment and emit stock movements. The recent `technical-installation-stock-lifecycle` change had to extend the same guard to cover both. They are destined to fuse.
2. **Dead values.** `key_configuration` and `key_installation` have zero production rows and no creator path anywhere in the codebase — pure CHECK-constraint noise blocked by a defensive INSERT trigger.
3. **Latent bug on standalone installs.** `installation` is dual-purpose: created either by `confirm_technical_order` (with stock movements) or by the standalone `TareaFormSheet` (silently skipping stock movements). Requiring installs to always originate from an order removes the divergence.
4. **Naming rules that don't compose.** New categories have no rule to follow. Every addition re-opens the naming debate.

The reform is cheapest today (2 production rows in `support.tickets`, both `installation`, both `resolved`) and gets more expensive with every new ticket, feature, and referring file.

## What Changes

- **Rename 5 → 4 categories with uniform `verb_object` naming** on `support.tickets.category`:
  - `installation` + `equipment_installation` → `install_equipment` (fused)
  - `equipment_replacement` → `replace_equipment`
  - `equipment_update` → `update_equipment`
  - `maintenance` → `maintain_equipment`
- **Drop `key_configuration` and `key_installation`** from the CHECK constraint (zero production rows) and remove the defensive `tickets_reject_key_installation_inserts` trigger.
- **Collapse `technical_order_items.item_type`** from 4 values (`equipment`, `installation`, `maintenance`, `equipment_replacement`) to 3 (`install_equipment`, `replace_equipment`, `maintain_equipment`). The CASE mapping inside `confirm_technical_order` becomes identity.
- **Remove `installation` from the standalone `TareaFormSheet` create path.** Only `maintain_equipment` remains creatable standalone; installs must originate from a technical order.
- **Single delta migration** carries the schema change, function replacements, and data rename. Triggers on `support.tickets` are `DISABLE TRIGGER ALL` inside the transaction to bypass the `category IS IMMUTABLE` guard, then re-enabled before commit.
- **Systematic rename across the monorepo:** 8 admin files, 3 installer files, ~15 test files. Mechanical; touches label maps, category sets, switch statements, and test fixtures.

## Impact

- **Change size:** ~700–900 changed lines. May exceed the 800-line review budget; if so, single-PR delivery proceeds under acknowledged `size:exception`.
- **Data:** 2 rows renamed in `support.tickets` (both `installation` → `install_equipment`). Zero rows to migrate in `technical_order_items`. Zero data loss.
- **Migrations:** one new delta file, which supersedes (a) the affected sections of `20260831000000_baseline.sql` and (b) both `configure_technical_ticket_equipment` and `resolve_ticket` from `20260901120000_extend_installation_category_lifecycle.sql`.
- **Tests:** existing tests remain semantically valid — only strings change. Full suite green after apply is a gate.
- **Users affected:** admins and installers see new category labels in tables/forms/detail pages. Behavior unchanged; wording unified.
- **Callers of `add_technical_order_item`:** must pass the new `item_type` values (`install_equipment` / `replace_equipment` / `maintain_equipment`). No external consumers documented; all in-repo.

## Success Criteria

- CHECK constraint on `support.tickets.category` allows exactly `{install_equipment, replace_equipment, update_equipment, maintain_equipment}`.
- CHECK constraint on `technical_order_items.item_type` allows exactly `{install_equipment, replace_equipment, maintain_equipment}`.
- `confirm_technical_order` CASE mapping is identity (`item_type` → `category` one-to-one).
- No file in the monorepo references any of the old category strings (`equipment_installation`, `equipment_replacement`, `equipment_update`, `key_configuration`, `key_installation`, or `maintenance`/`installation` as DB category values). English words `maintenance` / `installation` in doc comments remain acceptable — the constraint is on category-string literals.
- `TareaFormSheet` standalone create only offers `maintain_equipment`.
- Full unit + integration test suite green after apply.
- Manual verification: create a technical order with each of the three `item_type` values, confirm it, and observe that the resulting ticket categories match the new names one-for-one.

## Non-goals

- Ticket terminal-state immutability (exploration bug #2) — deferred to a separate SDD.
- Any new features or user-visible capabilities beyond the rename and standalone-install removal.
- Migration to a pool-based equipment model.
- Splitting install into order-driven vs freestanding sub-types (user rejected; collapse to one).

## Risks

1. **`tickets_validate` enforces `category IS IMMUTABLE`.** The data-rename step must run inside `DISABLE TRIGGER ALL … ENABLE TRIGGER ALL` on `support.tickets`, wrapped in the migration transaction. Any transaction abort must guarantee triggers are re-enabled (transaction rollback restores trigger state, but explicit `ENABLE` before COMMIT is required). Top risk.
2. **Fusion of `installation` + `equipment_installation`.** Exploration found no business logic that distinguishes them, but the design phase must re-verify that no report, filter, or downstream analytics view depends on the distinction.
3. **Rename volume across ~15 test files.** Mechanical but easy to miss references (string interpolation, snapshot fixtures, MSW handlers). A single grep for old strings after apply is a mandatory gate.
4. **`add_technical_order_item` validation.** RPC-level validation of `item_type` must be updated in lockstep with the CHECK constraint or clients get inconsistent error messages.

## Ready for Spec/Design

Yes. Scope, non-goals, and success criteria are concrete enough for `sdd-spec` (behavior deltas) and `sdd-design` (migration transaction shape, rename sweep plan, trigger disable/enable ordering) to proceed in parallel.
