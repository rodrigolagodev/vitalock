# Archived SQL Tests

Tests in this directory are kept for historical reference.  They asserted
models that were superseded by a schema change and would fail against the
current DB by design — not because the DB is wrong, but because the
assertion no longer describes reality.

These files are **not** picked up by `pnpm test:sql`.  The runner is invoked
with `pg_prove -r supabase/tests-sql`, which recurses into subdirectories, so
the archive files would normally be included.  To prevent that, the runner is
called as `pg_prove --ext .sql -r supabase/tests-sql` but excluded from the
glob by always placing broken tests here.  Alternatively the runner script
may be updated to only target the top-level directory with a non-recursive
glob.

## Why tests break

All files below insert into or query `public.orders` or `public.order_items`,
which were dropped by the bounded-context split in **PR-3**
(migration `20260818000094_legacy_orders_retirement.sql`).

## Contents

| File | Broken by | Why archived |
|------|-----------|--------------|
| `smoke_orders_draft_confirmed.sql` | PR-3 (`public.orders` dropped) | Asserts schema shape of legacy `public.orders` status domain and legacy RPCs (`confirm_order`, `update_draft_order_with_items`) that no longer exist. |
| `test_068_configure_key_order_item.sql` | PR-3 (`public.orders` dropped) | Inserts into `public.orders` and `public.order_items` to create the key-order fixture needed by `configure_key_order_item`. The function now consumes `key_order_items`, not the legacy tables. |
| `test_070_resolve_equipment_update.sql` | PR-3 (`public.orders` dropped) | Inserts into `public.orders` and `public.order_items` to create the key fixture for `resolve_equipment_update`. The successor coverage lives in `test_092_resolve_rpcs_dual_fk.sql` scenario C. |
| `test_072_resolve_equipment_update_v2_return.sql` | PR-3 (`public.orders` dropped) | Same as test_070 — uses legacy order fixture pattern for v2 return-type assertions. Successor coverage in test_092. |
| `test_074_resolve_equipment_update_atomicity.sql` | PR-3 (`public.orders` dropped) | Atomicity test for `resolve_equipment_update` using legacy order fixtures. Atomicity coverage now exercised within test_092 scenarios. |
| `test_atomic_stock_work_resolution.sql` | PR-3 (`public.orders` dropped) | Tests `resolve_equipment_installation` and `resolve_equipment_replacement` using `public.orders` and `public.order_items` as the reservation source. Stock movement RPCs now use `technical_order_items` and the dual-FK path (test_092). |
| `test_confirm_order.sql` | PR-3 (`public.confirm_order` dropped) | The legacy `public.confirm_order(uuid)` RPC was retired in migration 000094. New lifecycle is `confirm_key_order` / `confirm_technical_order`. |
| `test_no_side_effects_on_draft_insert.sql` | PR-3 (`public.orders` dropped) | Asserts side-effect-free draft insert into `public.order_items`. The legacy table is gone; the new tables (`key_order_items`, `technical_order_items`) have their own coverage in W18. |
| `test_unify_work_tracking.sql` | PR-3 (`public.orders` dropped) | Uses `public.orders` + `public.order_items` + `public.recompute_order_status` (dropped in 000094). Key-order status recompute is now handled by `recompute_key_order_status` triggered from `key_order_items`. |
| `test_keys_ready_for_pickup_requires_installation.sql` | Pre-PR-3 (`key_authorizations` model) | Asserted the pre-`20260812000060` ticket-gated readiness model. Superseded by the `key_authorizations`-driven model; live coverage in `../test_unify_work_tracking.sql` (now also archived — see above). |
