-- ============================================================
-- pgTAP: technical_order_items intent-snapshot immutability
-- ============================================================
-- Spec: technical-orders / Intent-Snapshot Immutability After Confirm
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 107-S1 through PASS 107-S3 preserved.
-- ============================================================

BEGIN;
SELECT plan(3);

-- ============================================================
-- Scenario 1 (PASS 107-S1): updating intended_equipment_id on confirmed item raises
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_eq_id       uuid;
      v_eq_id_2     uuid;
      v_order_id    uuid;
      v_item_id     uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 107-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 107-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 107-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-107-S1-A', v_building_id, 'Test Equipment A') RETURNING id INTO v_eq_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-107-S1-B', v_building_id, 'Test Equipment B') RETURNING id INTO v_eq_id_2;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'maintenance',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.technical_order_items WHERE order_id = v_order_id LIMIT 1;

      -- Attempt to change the intent field — must be rejected by trigger
      UPDATE public.technical_order_items
         SET intended_equipment_id = v_eq_id_2
       WHERE id = v_item_id;
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 107-S1: updating intended_equipment_id on confirmed item raises (immutable)'
);

-- ============================================================
-- Scenario 2 (PASS 107-S2): intent fields are mutable in draft state
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_eq_id       uuid;
      v_order_id    uuid;
      v_item_id     uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 107-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 107-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 107-S2 Staff', 'installer') RETURNING id INTO v_staff_id;

      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-107-S2', v_building_id, 'Test Equipment Draft') RETURNING id INTO v_eq_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'maintenance',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        false
      );

      SELECT id INTO v_item_id FROM public.technical_order_items WHERE order_id = v_order_id LIMIT 1;

      -- In draft, updating intent fields should succeed
      UPDATE public.technical_order_items
         SET intended_equipment_id = v_eq_id
       WHERE id = v_item_id;

      ASSERT (SELECT intended_equipment_id FROM public.technical_order_items WHERE id = v_item_id) = v_eq_id,
        'FAIL 107-S2: intended_equipment_id should be updatable in draft state';
    END $$;
  $q$,
  'PASS 107-S2: intent fields are mutable when parent order is in draft'
);

-- ============================================================
-- Scenario 3 (PASS 107-S3): technical_orders rejects ready_for_pickup status
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 107-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 107-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 107-S3 Staff', 'installer') RETURNING id INTO v_staff_id;

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

      -- ready_for_pickup is NOT in technical_orders status domain
      UPDATE public.technical_orders SET status = 'ready_for_pickup' WHERE id = v_order_id;
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 107-S3: technical_orders rejects ready_for_pickup status (domain violation)'
);

SELECT * FROM finish();
ROLLBACK;
