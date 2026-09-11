-- ============================================================
-- pgTAP: terminal-state immutability triggers (closes plan gap P2-3)
-- ============================================================
-- Migration 20260901170000 added BEFORE UPDATE triggers that reject any
-- change to a row already in a terminal status. Existing tests (103, 106)
-- only exercise the older in-RPC guards (*_TERMINAL_STATE); nothing covered
-- a raw table UPDATE that bypasses the RPC. This file does, for all three
-- aggregates, asserting the trigger's own error text.
-- ============================================================

BEGIN;
SELECT plan(3);

DO $$
DECLARE
  v_org_id      uuid;
  v_building_id uuid;
BEGIN
  INSERT INTO public.administrations (company_name) VALUES ('Test 133 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 133 Building', 'Calle 133', v_org_id) RETURNING id INTO v_building_id;

  -- Draft orders, then cancel them through the RPC so they reach a terminal state legitimately.
  PERFORM public.cancel_key_order(public.create_key_order_with_items(
    jsonb_build_object('client_type', 'administration', 'administration_id', v_org_id),
    ARRAY[jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)]::jsonb[],
    false
  ));
  PERFORM public.cancel_technical_order(public.create_technical_order_with_items(
    jsonb_build_object('client_type', 'administration', 'administration_id', v_org_id),
    ARRAY[jsonb_build_object('item_type', 'maintain_equipment', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)]::jsonb[],
    false
  ));

  -- Ticket: open, then cancelled via a normal UPDATE (non-terminal -> terminal is allowed).
  INSERT INTO support.tickets (administration_id, building_id, category, description, status)
    VALUES (v_org_id, v_building_id, 'maintain_equipment', 'Test 133 ticket', 'open');
  UPDATE support.tickets SET status = 'cancelled', cancellation_reason = 'Test 133 fixture' WHERE description = 'Test 133 ticket';
END $$;

SELECT throws_like(
  $q$ UPDATE public.key_orders SET notes = 'tamper'
        WHERE administration_id = (SELECT id FROM public.administrations WHERE company_name = 'Test 133 Client') $q$,
  'KEY_ORDER_TERMINAL:%',
  'PASS 133-S1: raw UPDATE on a cancelled key_order is rejected by the trigger'
);

SELECT throws_like(
  $q$ UPDATE public.technical_orders SET notes = 'tamper'
        WHERE administration_id = (SELECT id FROM public.administrations WHERE company_name = 'Test 133 Client') $q$,
  'TECHNICAL_ORDER_TERMINAL:%',
  'PASS 133-S2: raw UPDATE on a cancelled technical_order is rejected by the trigger'
);

SELECT throws_like(
  $q$ UPDATE support.tickets SET status = 'in_progress' WHERE description = 'Test 133 ticket' $q$,
  'TICKETS_TERMINAL:%',
  'PASS 133-S3: raw UPDATE on a cancelled ticket is rejected by the trigger'
);

SELECT * FROM finish();
ROLLBACK;
