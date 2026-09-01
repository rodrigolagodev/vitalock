-- enforce_technical_order_item_quantity_one
--
-- Business rule: each technical_order_items row represents exactly one unit
-- of work. Multiple installations require multiple items (no single equipment
-- can host two simultaneous installations against one item). The UI hides the
-- quantity input and always submits 1; this CHECK enforces it at the DB level
-- so any direct RPC call or manual insert cannot violate the invariant.
--
-- Live DB pre-check: all existing rows already have quantity = 1 (verified
-- via SELECT before adding the constraint).

ALTER TABLE public.technical_order_items
  ADD CONSTRAINT technical_order_items_quantity_one
  CHECK (quantity = 1);
