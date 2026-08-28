---
name: billing-transitions
title: Billing — Order Completion & Recurring Charges
kind: cross-cutting
actors: [admin, system]
covers_requirements:
  - ordenes-admin#completed-to-invoiced-transition
  - sales-billing#recurring-charges-monthly-cron
related_rpcs:
  - mark_key_order_invoiced
  - mark_technical_order_invoiced
  - sales.generate_recurring_charges
related_tables:
  - public.key_orders
  - public.technical_orders
  - sales.bills
  - sales.bill_items
  - sales.recurring_charges
  - sales.payments
covering_tests:
  pgtap: []
  vitest: []
last_verified: 2026-08-27
---

# Billing — Order Completion & Recurring Charges

## Purpose

Vitalock has **two independent billing tracks**:

1. **One-off billing** — an order transitions to `completed`, then
   an admin (or downstream) calls `mark_*_order_invoiced` to move it
   to `invoiced`. The invoice generation itself is currently **not
   automated**; the "invoiced" status is a bookkeeping flag saying
   "this order was billed elsewhere (via `sales.bills`)".
2. **Recurring billing** — `sales.recurring_charges` holds
   subscriptions (monthly maintenance fees, etc.). A `pg_cron` job
   generates a `sales.bill` on the 1st of every month via
   `sales.generate_recurring_charges`.

The two tracks share the same `sales.bills` and `sales.bill_items`
tables but differ in their producer:

| Producer | Emitted at | Frequency |
|---|---|---|
| Order lifecycle | `mark_*_order_invoiced` | On demand, per order |
| Recurring charges | `sales.generate_recurring_charges(year, month)` | Monthly (pg_cron) |

## The order → invoiced transition

### Key orders

`mark_key_order_invoiced`
(`supabase/migrations/20260818000087_rpc_key_order_lifecycle.sql:438`):

- Requires `key_orders.status='completed'`.
- Transitions to `status='invoiced'`. Terminal.
- Does NOT create a `sales.bill` row. That is a separate manual step
  (or a downstream integration not present in this repo yet).

### Technical orders

`mark_technical_order_invoiced`
(`supabase/migrations/20260818000090_rpc_technical_order_lifecycle.sql`
around the `mark_*_invoiced` block):

- Requires `technical_orders.status='completed'`.
- Transitions to `status='invoiced'`. Terminal.

**The label in the UI reads "Lista para facturar" for `completed`**
(`TechnicalOrderStatusBadge.tsx:9`) — that is because at
`completed` the work is done and the order is READY to be billed
externally. The transition to `invoiced` is a manual click that
happens after the external billing system has generated the actual
invoice.

## Recurring charges — the pg_cron job

Defined in
`supabase/migrations/20260808000016_pg_cron_recurring_charges.sql`.

### Schedule

`cron.schedule('sales-generate-monthly-charges', '0 8 1 * *', ...)`:

- Every **1st of the month at 08:00 UTC** (~05:00 ART).
- Calls `sales.generate_recurring_charges(YYYY, MM)` with the current
  year/month.

### Defensive setup

The migration is wrapped in a `DO` block that:

- Checks `pg_available_extensions` for `pg_cron` — if unavailable,
  emits a NOTICE and continues without failure.
- If setup fails for any reason (e.g., `shared_preload_libraries` not
  configured), emits a NOTICE and continues.

Effect: dev environments without pg_cron don't break the migration;
they just require manual invocation of
`sales.generate_recurring_charges(year, month)`.

### What the job does

`sales.generate_recurring_charges(p_year int, p_month int)`
(`supabase/migrations/20260807000012_sales_billing.sql:485`):

- Iterates `sales.recurring_charges` rows that are `active` and
  fall within the (year, month) window.
- Creates one `sales.bill` per administration with the aggregated
  charges as `bill_items`, marked
  `'Auto-generado por generate_recurring_charges(YEAR, MONTH)'`.
- Idempotent per (recurring_charge, year, month) — safe to re-run.

## Bill payment path

`sales.bills` have a `status` that transitions from `pending` →
`paid` via `sales.payments`. This flow is NOT covered here (it lives
in the admin/bills UI which is not currently a documented flow).

## Cross-cutting effects

- **Order status labels lie a little**: `completed` displays as "Lista
  para facturar" for technical orders, "Completado" for key orders.
  Both are correct semantically ("ready to bill" and "delivered
  respectively") but a QA glance can be misleading if the tester does
  not know the distinction.
- **RLS**: `sales.*` is admin-only (see [[rls-boundaries]]).
  Installers see no billing.
- **No idempotency across `mark_*_invoiced` and manual bill creation**
  — an admin can mark an order invoiced and forget to create the bill,
  or vice versa. There is no cross-link today.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| `mark_*_invoiced` on non-completed | Status check | Raises |
| `mark_*_invoiced` on already invoiced | Status check | Raises (already terminal) |
| pg_cron job runs but `pg_cron` was never installed | Migration NOTICE at deploy | Job never scheduled — manual generation required |
| Same `generate_recurring_charges(year, month)` called twice | Idempotency per (charge, year, month) | Second call is safe no-op |

## Known gaps

1. **No automatic `sales.bill` creation on order invoice**. The
   `mark_*_invoiced` transition is a status flip only; the actual
   invoice must be created elsewhere. Consider linking the two so
   the transition also inserts the bill.
2. **The pg_cron job is not idempotent at the run level** — if the
   job fires at 08:00 UTC and the DB is under load, a manual re-run
   later that day would be safe (idempotent per charge) but log an
   extra NOTICE. Not a real bug, just noise.
3. **The pg_cron schedule is UTC-fixed** — 08:00 UTC = 05:00 ART.
   That's fine for AR, but any future timezone-sensitive schedule
   should verify.
4. **`sales.recurring_charges` has no UI in the admin app** (verify
   in the sidebar). If it's DB-only, the recurring billing setup is
   an admin-shell task, not a self-serve one.

## QA checklist

- [ ] Set up a completed key order. Call `mark_key_order_invoiced`
      → verify status → `invoiced`.
- [ ] Set up a completed technical order. Call
      `mark_technical_order_invoiced` → verify status → `invoiced`.
- [ ] Try `mark_*_invoiced` on a `draft` order → RPC rejects.
- [ ] Manually invoke
      `sales.generate_recurring_charges(2026, 8)` (or current
      YYYY, MM). Verify `sales.bills` rows created for every active
      recurring charge in that month.
- [ ] Re-invoke the same → verify no duplicates.
- [ ] If pg_cron is available in the deploy environment, verify the
      job exists: `SELECT * FROM cron.job WHERE jobname =
      'sales-generate-monthly-charges'`.

## Related flows

- [[key-order-lifecycle]] — the source of `completed → invoiced`.
- [[technical-order-lifecycle]] — sibling source.
- [[rls-boundaries]] — sales schema is admin-only.
