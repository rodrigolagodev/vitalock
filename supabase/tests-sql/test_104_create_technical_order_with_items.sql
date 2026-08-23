-- ============================================================
-- pgTAP: public.create_technical_order_with_items
-- ============================================================
-- Spec: technical-orders / Atomic Create-and-Confirm RPC
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 104-S1 through PASS 104-S6 preserved.
-- ============================================================

BEGIN;
SELECT plan(6);

-- ============================================================
-- Scenario 1 (PASS 104-S1): happy path draft — creates technical_order + items
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
      v_item_count  int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 104-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 104-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 104-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 200
          )
        ]::jsonb[],
        false
      );

      ASSERT v_order_id IS NOT NULL, 'FAIL 104-S1: order_id should not be null';

      SELECT status INTO v_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_status = 'draft', 'FAIL 104-S1: expected draft with p_confirm_immediately=false, got ' || v_status;

      SELECT count(*) INTO v_item_count FROM public.technical_order_items WHERE order_id = v_order_id;
      ASSERT v_item_count = 1, 'FAIL 104-S1: expected 1 item, got ' || v_item_count::text;
    END $$;
  $q$,
  'PASS 104-S1: create_technical_order_with_items creates draft order with items'
);

-- ============================================================
-- Scenario 2 (PASS 104-S2): item_type='key' raises TECHNICAL_ORDER_INVALID_ITEM_TYPE
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 104-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 104-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 104-S2 Staff', 'installer') RETURNING id INTO v_staff_id;

      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'key',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 200
          )
        ]::jsonb[],
        false
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 104-S2: item_type=key raises TECHNICAL_ORDER_INVALID_ITEM_TYPE'
);

-- ============================================================
-- Scenario 3 (PASS 104-S3): missing building_id raises TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 104-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 104-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 104-S3 Staff', 'installer') RETURNING id INTO v_staff_id;

      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 200
          )
        ]::jsonb[],
        false
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 104-S3: missing building_id raises TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED'
);

-- ============================================================
-- Scenario 4 (PASS 104-S4): p_confirm_immediately=true missing assignee raises
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 104-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 104-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;

      -- No intended_assignee_staff_id → must raise when confirming
      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'quantity', 1,
            'unit_price', 200
          )
        ]::jsonb[],
        true
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 104-S4: confirm with null intended_assignee_staff_id raises TECHNICAL_ORDER_INTENT_REQUIRED'
);

-- ============================================================
-- Scenario 5 (PASS 104-S5): maintenance item missing intended_equipment_id raises
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 104-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 104-S5 Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 104-S5 Staff', 'installer') RETURNING id INTO v_staff_id;

      -- maintenance without equipment_id → must raise when confirming
      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'maintenance',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 200
          )
        ]::jsonb[],
        true
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 104-S5: maintenance item with null intended_equipment_id raises TECHNICAL_ORDER_INTENT_REQUIRED'
);

-- ============================================================
-- Scenario 6 (PASS 104-S6): installation item with null equipment_id is allowed at confirm
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 104-S6 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 104-S6 Building', 'Calle 6', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 104-S6 Staff', 'installer') RETURNING id INTO v_staff_id;

      -- installation without equipment_id → allowed
      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 200
          )
        ]::jsonb[],
        true
      );

      SELECT status INTO v_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_status = 'confirmed',
        'FAIL 104-S6: installation item with null equipment should still confirm, got status=' || v_status;
    END $$;
  $q$,
  'PASS 104-S6: installation item with null intended_equipment_id confirms successfully'
);

SELECT * FROM finish();
ROLLBACK;
