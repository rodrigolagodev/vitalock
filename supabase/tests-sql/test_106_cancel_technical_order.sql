-- ============================================================
-- pgTAP: public.cancel_technical_order
-- ============================================================
-- Spec: technical-orders / Cancel Technical Order RPC
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 106-S1 through PASS 106-S4 preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 106-S1): cancel_technical_order sets status=cancelled
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_status      text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 106-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 106-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 106-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        true
      );

      PERFORM public.cancel_technical_order(v_order_id);

      SELECT status INTO v_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_status = 'cancelled', 'FAIL 106-S1: expected cancelled, got ' || v_status;
    END $$;
  $q$,
  'PASS 106-S1: cancel_technical_order sets status to cancelled'
);

-- ============================================================
-- Scenario 2 (PASS 106-S2): cancel propagates to open tickets
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_cancelled_tickets int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 106-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 106-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 106-S2 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        true
      );

      PERFORM public.cancel_technical_order(v_order_id);

      SELECT count(*) INTO v_cancelled_tickets
        FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id
         AND t.status = 'cancelled';

      ASSERT v_cancelled_tickets >= 1,
        'FAIL 106-S2: expected at least 1 cancelled ticket after cancel, got ' || v_cancelled_tickets::text;
    END $$;
  $q$,
  'PASS 106-S2: cancel_technical_order cancels linked open tickets'
);

-- ============================================================
-- Scenario 3 (PASS 106-S3): cancel from draft (not yet confirmed) also works
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_status      text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 106-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 106-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 106-S3 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        false
      );

      PERFORM public.cancel_technical_order(v_order_id);

      SELECT status INTO v_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_status = 'cancelled', 'FAIL 106-S3: expected cancelled from draft, got ' || v_status;
    END $$;
  $q$,
  'PASS 106-S3: cancel_technical_order works from draft status too'
);

-- ============================================================
-- Scenario 4 (PASS 106-S4): double-cancel raises TECHNICAL_ORDER_TERMINAL_STATE
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 106-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 106-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 106-S4 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        true
      );

      PERFORM public.cancel_technical_order(v_order_id);
      PERFORM public.cancel_technical_order(v_order_id);
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 106-S4: double-cancel raises TECHNICAL_ORDER_TERMINAL_STATE'
);

SELECT * FROM finish();
ROLLBACK;
