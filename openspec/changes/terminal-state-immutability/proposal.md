# Proposal: terminal-state-immutability

## Executive Summary

Enforce row-level immutability on three aggregates (`support.tickets`,
`public.technical_orders`, `public.key_orders`) once they reach a terminal
status, preventing any UPDATE — field or status — via a BEFORE UPDATE database
trigger backed by UI-level edit guards.

---

## Problem

### User-reported bug

A resolved ticket can be edited back to `in_progress` with a different
assignee, silently rewriting who performed the work. The same class of
mutation is possible on invoiced orders: items could be added, the client
changed, or the order cancelled after invoicing.

### Audit defensibility

Without terminal immutability the ticket and order ledger is not defensible.
Any resolved or invoiced record can be mutated at the database layer by an
authenticated Supabase client. There is no commit log of what a record
contained at the moment of resolution or invoicing.

### Inconsistency with existing patterns

Vitalock already enforces append-only or column-immutable patterns for
`stock_movements`, equipment serial reassignment, RFID key reassignment, key
authorizations, and technical order item intent. The three aggregates covered
here are the only major business entities with no such protection.

---

## Scope

### In scope

- BEFORE UPDATE trigger function `support.tickets_terminal_immutable()` —
  raises P0001 when `OLD.status IN ('resolved', 'cancelled')`.
- BEFORE UPDATE trigger function `public.technical_orders_terminal_immutable()`
  — raises P0001 when `OLD.status IN ('invoiced', 'cancelled')`.
- BEFORE UPDATE trigger function `public.key_orders_terminal_immutable()` —
  raises P0001 when `OLD.status IN ('invoiced', 'cancelled')`.
- One SQL delta migration wiring all three trigger functions via
  `CREATE TRIGGER ... BEFORE UPDATE ON ...`.
- UI guard: hide the `Editar` button in `TareaDetailPage.tsx` when ticket
  status is `resolved` or `cancelled`.
- UI guard: hide the pickup-person action in `KeyOrderItemsTable` when key
  order status is `invoiced` or `cancelled`.
- New and updated test cases for the six trigger paths and the two UI guards.

### Out of scope

- Reopen mechanism — deferred until a real correction case appears.
- Correction ticket pattern — deferred for the same reason.
- Cleanup of the now-dead `resolved → in_progress` branches in
  `tickets_validate` and `TareaFormSheet.VALID_TRANSITIONS` — follow-up
  change.
- Audit log or comments table for terminal rows.
- Row-level terminal locking for `key_order_items` or `technical_order_items`
  (the latter already has `technical_order_items_intent_immutable`).
- set_config bypass mechanism — verified unnecessary; no legitimate write
  targets a genuinely-terminal row.

---

## Terminal State Definitions

| Aggregate | Terminal statuses | Non-terminal despite being late-stage |
|---|---|---|
| `support.tickets` | `resolved`, `cancelled` | — |
| `public.technical_orders` | `invoiced`, `cancelled` | `completed` |
| `public.key_orders` | `invoiced`, `cancelled` | `completed` |

`completed` is intentionally excluded from both order aggregates.
`mark_technical_order_invoiced` and `mark_key_order_invoiced` write the
transition `completed → invoiced`. If `completed` were terminal those RPCs
would break with no bypass in place. This matches the existing UI constant
`TERMINAL_STATUSES = ['invoiced', 'cancelled']` already used in
`TechnicalOrderDetailPage.tsx`.

---

## Approach

### Layer 1 — Database trigger (defense-in-depth)

Three BEFORE UPDATE trigger functions, one per aggregate, following the
naming convention `<schema>.<table>_terminal_immutable()` already established
by `public.technical_order_items_intent_immutable`.

Each function checks `OLD.status`. If terminal, it raises an exception with
`errcode = 'P0001'` and a structured message prefix
(`TICKETS_TERMINAL:`, `TECHNICAL_ORDER_TERMINAL:`, `KEY_ORDER_TERMINAL:`)
consistent with the existing `KEY_ORDER_TERMINAL_STATE` pattern. No row
columns are inspected — total row immutability, no whitelist.

A single SQL migration in `supabase/migrations/` installs the three functions
and three `CREATE TRIGGER` statements on the respective tables.

### Layer 2 — UI guards (good UX)

Two surfaces require explicit guards so users see disabled/hidden affordances
rather than a P0001 toast:

1. `TareaDetailPage.tsx:121` — the `Editar` button renders unconditionally
   today. Add `status IN ('resolved', 'cancelled')` check to suppress it.
2. `KeyOrderItemsTable` — the `setKeyOrderPickupPerson` action calls a direct
   client `.update()` on `key_orders`. Hide the action when order status is
   terminal.

`useMutateTarea` and `TareaFormSheet` do not need independent guards because
the `Editar` button is the sole entry point for the form sheet. The DB trigger
is the backstop for any path not UI-gated.

`AssignEquipmentDialog` in `TareaDetailPage` already gates on
`status !== 'resolved' && status !== 'cancelled'`, so no change needed there.

### Layer 3 — Tests

New test cases for:
- Trigger rejection on each terminal status for all three aggregates (six
  paths).
- Trigger pass-through for legitimate late transitions (`completed → invoiced`
  on both order types; `in_progress → resolved` on tickets).
- UI: `Editar` button absent in rendered terminal ticket.
- UI: pickup action absent in rendered terminal key order.

Files expected to gain cases: `useMutateTechnicalOrder.test.ts`,
`useMutateKeyOrder.test.ts`, `TechnicalOrderDetailPage.test.tsx`,
`KeyOrderDetailPage.test.tsx`, `TareaDetailPage.test.tsx` (probably new),
plus a new `useMutateTarea.test.ts` (no test file exists today).

---

## Rationale

- **No bypass needed** — cascading RPCs (`cancel_technical_order`,
  `resolve_ticket`, `recompute_technical_order_status`) were each verified to
  exclude already-terminal rows before touching them. No legitimate code path
  writes to a genuinely-terminal row.
- **Naming mirrors existing conventions** — `_terminal_immutable` parallels
  `_intent_immutable`; P0001 + structured prefix mirrors
  `KEY_ORDER_TERMINAL_STATE`.
- **Total immutability over field whitelist** — a whitelist creates ongoing
  maintenance burden and reasoning gaps. If a row is done, no column should
  change.
- **No data migration** — the trigger applies to future writes only. Existing
  rows are unaffected.

---

## Success Criteria

1. Any UPDATE against a terminal row (`tickets` resolved/cancelled,
   `technical_orders`/`key_orders` invoiced/cancelled) fails with a P0001
   error containing the structured prefix.
2. Legitimate late transitions pass without error: `completed → invoiced` on
   both order types; `in_progress → resolved` on tickets; full
   `open → in_progress → resolved` path.
3. The `Editar` button is absent from the `TareaDetailPage` UI when ticket
   status is `resolved` or `cancelled`.
4. The pickup-person action is absent from `KeyOrderItemsTable` when order
   status is `invoiced` or `cancelled`.
5. No existing passing test breaks.

---

## Risks and Open Items

1. **Dead code in `tickets_validate`** — the `resolved → in_progress`
   reapertura branch becomes unreachable once the trigger is live. The user
   confirmed "no reopen" so this is expected. The dead branch is left as-is
   for this change; cleanup is a follow-up.
2. **`setKeyOrderPickupPerson` direct UPDATE** — if the UI guard is missed or
   called from an unguarded path, the trigger fires and the user sees a P0001
   toast. Mitigation: the UI guard in `KeyOrderItemsTable` is in scope.
3. **Unmapped UPDATE paths** — any direct `.update()` against these tables
   in code not yet audited will surface as P0001 after the trigger lands. The
   trigger is intentionally defense-in-depth; primary surfaces are UI-gated.
4. **Budget** — 3 trigger functions + 3 CREATE TRIGGER statements + 2 UI
   guards + tests = ~150–200 authored lines. Well within the 800-line budget.

---

## Non-Goals (explicit)

- No reopen mechanism.
- No correction ticket flow.
- No audit log table.
- No migration of existing data.
- No set_config bypass.
- No cleanup of dead `resolved → in_progress` branches (follow-up).

---

## Key Learnings

1. Terminal sets for the two order aggregates are `{invoiced, cancelled}` only
   — `completed` is excluded because `mark_*_invoiced` transitions
   `completed → invoiced`, and no bypass mechanism is introduced in this
   change.
2. Zero existing RPCs write legitimately to a genuinely-terminal row, which
   means the trigger can be strict with no exceptions and no set_config bypass.
3. The only direct client UPDATE on `key_orders` outside of RPCs is
   `setKeyOrderPickupPerson`; this is the sole non-RPC path that needs an
   explicit UI guard alongside the trigger.
4. `tickets_validate` contains a live `resolved → in_progress` reapertura
   branch that becomes dead code after this change — expected per the "no
   reopen" product decision, but the branch is not cleaned up here to keep
   the change focused.
5. The naming convention (`_terminal_immutable`, P0001, structured message
   prefix) is already established in the codebase and this change follows it
   exactly, making the new triggers immediately legible to any future engineer.
