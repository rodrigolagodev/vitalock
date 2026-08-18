-- ============================================================
-- Migration: support.tickets dual-FK for key/technical order items
-- ============================================================
-- Replaces the single order_item_id FK with two context-specific FKs:
--   key_order_item_id      → public.key_order_items(id)
--   technical_order_item_id → public.technical_order_items(id)
--
-- XOR semantics: at most one of the two can be non-null. Both null is
-- allowed for tickets not originating from an order (matching the existing
-- nullable semantics of order_item_id).
--
-- No data migration needed: the system is pre-production with zero tickets.
-- Full recipe from design §4.
--
-- Depends on: 20260818000081 (key_order_items), 20260818000082 (technical_order_items)

-- 1. Drop the current FK constraint on order_item_id.
alter table support.tickets
  drop constraint if exists tickets_order_item_id_fkey;

-- 2. Drop the old index (partial index that referenced the old column).
drop index if exists tickets_order_item_id_idx;

-- 3. Drop the column (no rows to migrate; pre-production).
alter table support.tickets
  drop column if exists order_item_id;

-- 4. Add the two new dual-FK columns.
alter table support.tickets
  add column key_order_item_id uuid null
    references public.key_order_items(id) on delete set null,
  add column technical_order_item_id uuid null
    references public.technical_order_items(id) on delete set null;

-- 5. XOR CHECK — at most one of the two must be non-null.
--    Allowed combinations:
--      (null,  null)   — ticket not linked to any order item
--      (uuid,  null)   — linked to a key order item
--      (null,  uuid)   — linked to a technical order item
--    Rejected:
--      (uuid,  uuid)   — ambiguous; violates bounded context isolation
alter table support.tickets
  add constraint tickets_order_item_xor_check check (
    not (key_order_item_id is not null and technical_order_item_id is not null)
  );

-- 6. Partial indexes for the sync trigger + admin joins.
create index tickets_key_order_item_id_idx
  on support.tickets (key_order_item_id)
  where key_order_item_id is not null;

create index tickets_technical_order_item_id_idx
  on support.tickets (technical_order_item_id)
  where technical_order_item_id is not null;
