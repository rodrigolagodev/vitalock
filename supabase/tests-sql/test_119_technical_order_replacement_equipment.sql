-- ============================================================
-- pgTAP: technical_order_items intended_replacement_equipment_id
-- ============================================================
-- Covers migrations 20260826000100 (schema) and 20260826000101 (RPCs).
--
-- Scenarios:
--   S1: equipment_replacement item with both intents confirms successfully
--       and persists both FKs.
--   S2: equipment_replacement item without intended_replacement_equipment_id
--       raises TECHNICAL_ORDER_INTENT_REQUIRED at confirm.
--   S3: non-replacement item cannot set intended_replacement_equipment_id
--       (CHECK constraint technical_order_items_replacement_only_for_replacement_type).
--   S4: intended_replacement_equipment_id cannot equal intended_equipment_id
--       (CHECK constraint technical_order_items_replacement_not_equal_to_target).
-- ============================================================

BEGIN;
SELECT plan(4);

-- ------------------------------------------------------------
-- S1: happy path — both intents set, confirms, both persisted.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_admin_id     uuid;
  v_building_id  uuid;
  v_staff_id     uuid;
  v_eq_old       uuid;
  v_eq_new       uuid;
  v_order_id     uuid;
  v_old_stored   uuid;
  v_new_stored   uuid;
BEGIN
  INSERT INTO public.administrations (company_name) VALUES ('Test 119-S1 Admin') RETURNING id INTO v_admin_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 119-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
  INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S1 Staff', 'installer') RETURNING id INTO v_staff_id;
  INSERT INTO operations.equipment (serial_number, building_id, description)
    VALUES ('EQ-119-S1-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;
  INSERT INTO operations.equipment (serial_number, building_id, description)
    VALUES ('EQ-119-S1-NEW', v_building_id, 'From warehouse') RETURNING id INTO v_eq_new;

  v_order_id := public.create_technical_order_with_items(
    jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
    ARRAY[
      jsonb_build_object(
        'item_type', 'equipment_replacement',
        'building_id', v_building_id,
        'intended_assignee_staff_id', v_staff_id,
        'intended_equipment_id', v_eq_old,
        'intended_replacement_equipment_id', v_eq_new,
        'quantity', 1,
        'unit_price', 500
      )
    ]::jsonb[],
    true
  );

  SELECT intended_equipment_id, intended_replacement_equipment_id
    INTO v_old_stored, v_new_stored
    FROM public.technical_order_items
   WHERE order_id = v_order_id;

  PERFORM ok(
    v_old_stored = v_eq_old AND v_new_stored = v_eq_new,
    'PASS 119-S1: equipment_replacement persists both intended_equipment_id and intended_replacement_equipment_id'
  );
END $$;

-- ------------------------------------------------------------
-- S2: missing intended_replacement_equipment_id raises at confirm.
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S2 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S2 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S2-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;

      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'equipment_replacement',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_old,
            'quantity', 1,
            'unit_price', 500
          )
        ]::jsonb[],
        true
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 119-S2: equipment_replacement without intended_replacement_equipment_id raises TECHNICAL_ORDER_INTENT_REQUIRED at confirm'
);

-- ------------------------------------------------------------
-- S3: non-replacement item type cannot set intended_replacement_equipment_id.
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
      v_eq_new       uuid;
      v_order_id     uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S3 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S3 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S3-A', v_building_id, 'A') RETURNING id INTO v_eq_old;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S3-B', v_building_id, 'B') RETURNING id INTO v_eq_new;

      -- Create a maintenance draft order first, then try to set replacement FK.
      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'maintenance',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_old,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        false
      );

      UPDATE public.technical_order_items
         SET intended_replacement_equipment_id = v_eq_new
       WHERE order_id = v_order_id;
    END $$;
  $q$,
  '23514',  -- check_violation
  NULL,
  'PASS 119-S3: non-replacement item_type rejects intended_replacement_equipment_id via CHECK constraint'
);

-- ------------------------------------------------------------
-- S4: replacement cannot equal target.
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_same      uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S4 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S4 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S4', v_building_id, 'Same') RETURNING id INTO v_eq_same;

      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'equipment_replacement',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_same,
            'intended_replacement_equipment_id', v_eq_same,
            'quantity', 1,
            'unit_price', 500
          )
        ]::jsonb[],
        false
      );
    END $$;
  $q$,
  '23514',  -- check_violation
  NULL,
  'PASS 119-S4: intended_replacement_equipment_id cannot equal intended_equipment_id (CHECK constraint)'
);

SELECT * FROM finish();
ROLLBACK;
